-- ============================================================
-- WK ONLINE MART — SUPABASE DATABASE SCHEMA
-- Supabase Dashboard -> SQL Editor mein yeh pura file run karein
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- CATEGORIES ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  image_url text,
  created_at timestamptz default now()
);

-- ---------- PRODUCTS ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  manufacturer text,
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PROFILES (customers) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  created_at timestamptz default now()
);

-- ---------- ADMINS ----------
create table if not exists admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- ---------- CART ITEMS ----------
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz default now(),
  unique (user_id, product_id)
);

-- ---------- ORDERS ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_id uuid not null references auth.users(id) on delete cascade,
  total_amount numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  shipping_address text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- auto order number: WK-000001, WK-000002, ...
create sequence if not exists order_number_seq start 1;

create or replace function set_order_number()
returns trigger as $$
begin
  if new.order_number is null then
    new.order_number := 'WK-' || lpad(nextval('order_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_order_number on orders;
create trigger trg_set_order_number
before insert on orders
for each row execute function set_order_number();

-- ---------- ORDER ITEMS ----------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table categories enable row level security;
alter table products enable row level security;
alter table profiles enable row level security;
alter table admins enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- helper: is current user an admin?
create or replace function is_admin()
returns boolean as $$
  select exists (select 1 from admins where id = auth.uid());
$$ language sql stable;

-- CATEGORIES: everyone can read, only admin can write
create policy "categories_read_all" on categories for select using (true);
create policy "categories_admin_write" on categories for insert with check (is_admin());
create policy "categories_admin_update" on categories for update using (is_admin());
create policy "categories_admin_delete" on categories for delete using (is_admin());

-- PRODUCTS: everyone can read, only admin can write directly
-- (stock decrement during checkout happens through the place_order() function below,
--  which runs with elevated rights, so customers never need direct UPDATE access)
create policy "products_read_all" on products for select using (true);
create policy "products_admin_insert" on products for insert with check (is_admin());
create policy "products_admin_update" on products for update using (is_admin()) with check (is_admin());
create policy "products_admin_delete" on products for delete using (is_admin());

-- PROFILES: user manages own row, admin can read all
create policy "profiles_self_select" on profiles for select using (auth.uid() = id or is_admin());
create policy "profiles_self_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_self_update" on profiles for update using (auth.uid() = id or is_admin());

-- ADMINS: a user can check only their own row (no listing others)
create policy "admins_self_select" on admins for select using (auth.uid() = id);

-- CART_ITEMS: user manages own cart only
create policy "cart_self_all" on cart_items for select using (auth.uid() = user_id);
create policy "cart_self_insert" on cart_items for insert with check (auth.uid() = user_id);
create policy "cart_self_update" on cart_items for update using (auth.uid() = user_id);
create policy "cart_self_delete" on cart_items for delete using (auth.uid() = user_id);

-- ORDERS: customer sees/creates own orders, admin sees/updates all
create policy "orders_select" on orders for select using (auth.uid() = customer_id or is_admin());
create policy "orders_insert" on orders for insert with check (auth.uid() = customer_id);
create policy "orders_update" on orders for update using (is_admin());

-- ORDER_ITEMS: visible if you own the parent order, or you're admin
create policy "order_items_select" on order_items for select using (
  exists (select 1 from orders o where o.id = order_items.order_id and (o.customer_id = auth.uid() or is_admin()))
);
create policy "order_items_insert" on order_items for insert with check (
  exists (select 1 from orders o where o.id = order_items.order_id and o.customer_id = auth.uid())
);

-- ============================================================
-- ORDER PLACEMENT FUNCTION
-- Checkout is dosri function ke zariye hota hai — is se:
--  - price customer se nahi, database se liya jata hai (tampering nahi ho sakti)
--  - stock aur order dono ek hi atomic transaction mein hote hain
--  - customer ko products table par direct UPDATE access nahi deni parti
-- ============================================================
create or replace function place_order(
  p_items jsonb,          -- [{"product_id":"...", "quantity":2}, ...]
  p_phone text,
  p_address text,
  p_full_name text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_total numeric := 0;
  v_item jsonb;
  v_product products%rowtype;
  v_qty integer;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  insert into orders (customer_id, total_amount, status, shipping_address, phone)
  values (auth.uid(), 0, 'pending', p_address, p_phone)
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from products where id = (v_item->>'product_id')::uuid for update;

    if not found then
      raise exception 'Product not found';
    end if;
    if v_product.stock < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    insert into order_items (order_id, product_id, product_name, price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);

    update products set stock = stock - v_qty where id = v_product.id;

    v_total := v_total + (v_product.price * v_qty);
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

  insert into profiles (id, full_name, phone, address)
  values (auth.uid(), p_full_name, p_phone, p_address)
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, address = excluded.address;

  delete from cart_items where user_id = auth.uid();

  return json_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total_amount', v_total);
end;
$$;

grant execute on function place_order(jsonb, text, text, text) to authenticated;

-- ============================================================
-- SEED DATA — starter categories
-- ============================================================
insert into categories (name, slug) values
  ('Dresses', 'dresses'),
  ('Shoes', 'shoes'),
  ('Cosmetics', 'cosmetics')
on conflict (slug) do nothing;

-- ============================================================
-- IMPORTANT MANUAL STEPS (README mein bhi likha hai):
-- 1. Supabase Dashboard -> Storage -> naya PUBLIC bucket banayein: product-images
-- 2. Kisi user ko admin banane ke liye (pehle wo user signup kar le, phir):
--    insert into admins (id, email) values ('<user-uuid-from-auth-users>', 'admin@example.com');
-- ============================================================
