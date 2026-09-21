// ============================================================
// ADMIN APP LOGIC
// ============================================================
let adminUser = null;
let allCategories = [];

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ---------- tab navigation ----------
document.querySelectorAll("#sideNav a[data-tab]").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("#sideNav a[data-tab]").forEach(a => a.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.style.display = "none");
    const tab = link.dataset.tab;
    document.getElementById("panel-" + tab).style.display = "block";
    document.getElementById("pageTitle").textContent = link.textContent;
    if (tab === "products") loadProducts();
    if (tab === "categories") loadCategories();
    if (tab === "orders") loadOrders();
    if (tab === "customers") loadCustomers();
    if (tab === "overview") loadOverview();
  });
});

document.getElementById("viewSiteLink").addEventListener("click", (e) => {
  e.preventDefault();
  window.open("index.html", "_blank");
});

document.getElementById("logoutBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  window.location.href = "admin-login.html";
});

// ---------- overview ----------
async function loadOverview() {
  const [{ count: pc }, { count: oc }, { count: cc }, { count: pend }] = await Promise.all([
    supabaseClient.from("products").select("*", { count: "exact", head: true }),
    supabaseClient.from("orders").select("*", { count: "exact", head: true }),
    supabaseClient.from("profiles").select("*", { count: "exact", head: true }),
    supabaseClient.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  document.getElementById("statProducts").textContent = pc ?? "0";
  document.getElementById("statOrders").textContent = oc ?? "0";
  document.getElementById("statCustomers").textContent = cc ?? "0";
  document.getElementById("statPending").textContent = pend ?? "0";
}

// ============================================================
// PRODUCTS
// ============================================================
async function loadCategoriesIntoSelect() {
  const { data } = await supabaseClient.from("categories").select("*").order("name");
  allCategories = data || [];
  const sel = document.getElementById("pf_category");
  sel.innerHTML = allCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
}

async function loadProducts() {
  const tbody = document.getElementById("productsTbody");
  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  const { data, error } = await supabaseClient
    .from("products").select("*, categories(name)").order("created_at", { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="7">Error loading.</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="7">Koi product nahi.</td></tr>`; return; }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td><img src="${p.image_url || 'https://placehold.co/60x80?text=No+Img'}"></td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.categories ? p.categories.name : "—")}</td>
      <td>${fmtPrice(p.price)}</td>
      <td>${p.stock}</td>
      <td>${esc(p.manufacturer || "—")}</td>
      <td class="action-links">
        <button onclick="editProduct('${p.id}')">Edit</button>
        <button onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

document.getElementById("newProductBtn").addEventListener("click", async () => {
  await loadCategoriesIntoSelect();
  document.getElementById("productForm").reset();
  document.getElementById("pf_id").value = "";
  document.getElementById("pf_image_preview").innerHTML = "";
  document.getElementById("productModalTitle").textContent = "Naya Product";
  document.getElementById("productFormMsg").textContent = "";
  document.getElementById("productModal").classList.add("open");
});

document.getElementById("cancelProductBtn").addEventListener("click", () => {
  document.getElementById("productModal").classList.remove("open");
});

window.editProduct = async function (id) {
  await loadCategoriesIntoSelect();
  const { data: p } = await supabaseClient.from("products").select("*").eq("id", id).single();
  document.getElementById("pf_id").value = p.id;
  document.getElementById("pf_name").value = p.name;
  document.getElementById("pf_category").value = p.category_id;
  document.getElementById("pf_price").value = p.price;
  document.getElementById("pf_stock").value = p.stock;
  document.getElementById("pf_manufacturer").value = p.manufacturer || "";
  document.getElementById("pf_description").value = p.description || "";
  document.getElementById("pf_image_preview").innerHTML = p.image_url ? `<img src="${p.image_url}" style="width:70px">` : "";
  document.getElementById("productModalTitle").textContent = "Product Edit Karein";
  document.getElementById("productFormMsg").textContent = "";
  document.getElementById("productModal").classList.add("open");
};

window.deleteProduct = async function (id) {
  if (!confirm("Yeh product delete karna hai?")) return;
  await supabaseClient.from("products").update({ is_active: false }).eq("id", id);
  loadProducts();
  loadOverview();
};

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("productFormMsg");
  const saveBtn = e.target.querySelector("button[type=submit]");
  saveBtn.disabled = true;
  msg.textContent = "Save ho raha hai...";
  msg.className = "form-msg";

  const id = document.getElementById("pf_id").value;
  const payload = {
    name: document.getElementById("pf_name").value.trim(),
    category_id: document.getElementById("pf_category").value,
    price: parseFloat(document.getElementById("pf_price").value),
    stock: parseInt(document.getElementById("pf_stock").value),
    manufacturer: document.getElementById("pf_manufacturer").value.trim(),
    description: document.getElementById("pf_description").value.trim(),
  };

  // image upload (optional)
  const fileInput = document.getElementById("pf_image_file");
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const path = `${Date.now()}-${file.name}`;
    const { error: upErr } = await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file);
    if (upErr) {
      msg.textContent = "Image upload nahi hui: " + upErr.message;
      msg.classList.add("error");
      saveBtn.disabled = false;
      return;
    }
    const { data: pub } = supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    payload.image_url = pub.publicUrl;
  }

  let error;
  if (id) {
    ({ error } = await supabaseClient.from("products").update(payload).eq("id", id));
  } else {
    payload.is_active = true;
    ({ error } = await supabaseClient.from("products").insert(payload));
  }

  saveBtn.disabled = false;
  if (error) { msg.textContent = error.message; msg.classList.add("error"); return; }

  document.getElementById("productModal").classList.remove("open");
  loadProducts();
  loadOverview();
});

// ============================================================
// CATEGORIES
// ============================================================
async function loadCategories() {
  const tbody = document.getElementById("catsTbody");
  tbody.innerHTML = `<tr><td colspan="3">Loading...</td></tr>`;
  const { data, error } = await supabaseClient.from("categories").select("*").order("name");
  if (error) { tbody.innerHTML = `<tr><td colspan="3">Error.</td></tr>`; return; }
  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.slug)}</td>
      <td class="action-links">
        <button onclick="editCategory('${c.id}')">Edit</button>
        <button onclick="deleteCategory('${c.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

document.getElementById("newCatBtn").addEventListener("click", () => {
  document.getElementById("catForm").reset();
  document.getElementById("cf_id").value = "";
  document.getElementById("catModalTitle").textContent = "Nayi Category";
  document.getElementById("catFormMsg").textContent = "";
  document.getElementById("catModal").classList.add("open");
});
document.getElementById("cancelCatBtn").addEventListener("click", () => {
  document.getElementById("catModal").classList.remove("open");
});

window.editCategory = async function (id) {
  const { data: c } = await supabaseClient.from("categories").select("*").eq("id", id).single();
  document.getElementById("cf_id").value = c.id;
  document.getElementById("cf_name").value = c.name;
  document.getElementById("cf_image").value = c.image_url || "";
  document.getElementById("catModalTitle").textContent = "Category Edit Karein";
  document.getElementById("catModal").classList.add("open");
};

window.deleteCategory = async function (id) {
  if (!confirm("Category delete karni hai? Is category ke products bhi effect ho sakte hain.")) return;
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) { alert("Delete nahi hui: " + error.message); return; }
  loadCategories();
};

document.getElementById("catForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("catFormMsg");
  const id = document.getElementById("cf_id").value;
  const name = document.getElementById("cf_name").value.trim();
  const payload = { name, slug: slugify(name), image_url: document.getElementById("cf_image").value.trim() || null };

  let error;
  if (id) ({ error } = await supabaseClient.from("categories").update(payload).eq("id", id));
  else ({ error } = await supabaseClient.from("categories").insert(payload));

  if (error) { msg.textContent = error.message; msg.classList.add("error"); return; }
  document.getElementById("catModal").classList.remove("open");
  loadCategories();
});

// ============================================================
// ORDERS
// ============================================================
const STATUS_OPTIONS = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

async function loadOrders() {
  const tbody = document.getElementById("ordersTbody");
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  const { data, error } = await supabaseClient
    .from("orders").select("*").order("created_at", { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="6">Error.</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="6">Koi order nahi.</td></tr>`; return; }

  tbody.innerHTML = data.map(o => `
    <tr>
      <td>${esc(o.order_number)}</td>
      <td>${esc(o.phone)}</td>
      <td>${fmtPrice(o.total_amount)}</td>
      <td>
        <select onchange="updateOrderStatus('${o.id}', this.value)">
          ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
      <td class="action-links"><button onclick="viewOrder('${o.id}')">Details</button></td>
    </tr>
  `).join("");
}

window.updateOrderStatus = async function (id, status) {
  const { error } = await supabaseClient.from("orders").update({ status }).eq("id", id);
  if (error) alert("Status update nahi hua: " + error.message);
  loadOverview();
};

window.viewOrder = async function (id) {
  const { data: o } = await supabaseClient.from("orders").select("*, order_items(*)").eq("id", id).single();
  const lines = o.order_items.map(it => `${it.product_name} x${it.quantity} = ${fmtPrice(it.price * it.quantity)}`).join("\n");
  alert(`Order #${o.order_number}\nPhone: ${o.phone}\nAddress: ${o.shipping_address}\n\n${lines}\n\nTotal: ${fmtPrice(o.total_amount)}`);
};

// ============================================================
// CUSTOMERS
// ============================================================
async function loadCustomers() {
  const tbody = document.getElementById("customersTbody");
  tbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
  const { data, error } = await supabaseClient.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="4">Error.</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="4">Koi customer nahi.</td></tr>`; return; }
  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${esc(c.full_name || "—")}</td>
      <td>${esc(c.phone || "—")}</td>
      <td>${esc(c.address || "—")}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
    </tr>`).join("");
}

// ============================================================
// ADMIN PASSWORD
// ============================================================
document.getElementById("adminPwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("adminPwMsg");
  const { error } = await supabaseClient.auth.updateUser({ password: document.getElementById("adminNewPw").value });
  msg.textContent = error ? error.message : "Password update ho gaya.";
  msg.className = "form-msg " + (error ? "error" : "success");
  if (!error) e.target.reset();
});

// ============================================================
// INIT
// ============================================================
(async function init() {
  adminUser = await requireAdminAuth();
  if (!adminUser) return;
  loadOverview();
})();
