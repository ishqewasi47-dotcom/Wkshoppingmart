# WK Online Mart — Setup Guide (Flat Version — GitHub ke liye)

Yeh version **bilkul flat** hai — koi subfolder nahi, sab files seedha ek hi jagah hain. Isay GitHub par drag-drop karna sabse aasan hai (koi folder-structure ka masla nahi ayega).

## Files
- `index.html` → Homepage
- `login.html`, `signup.html` → Customer login/signup
- `product.html`, `cart.html`, `checkout.html`, `order-success.html` → Shopping flow
- `dashboard.html` → Customer profile + order history
- `admin-login.html` → Admin login
- `admin-index.html` → Admin panel (products, categories, orders, customers, password)
- `style.css`, `common.js`, `admin-app.js`, `supabase-client.js` → shared code
- `schema.sql` → Supabase mein run karne wali file

## GitHub Par Upload Kaise Karein
1. Purani repo ki **sab files delete kar dein** (jo pehle galat tarah upload hui thin)
2. "Add file → Upload files" par jayein
3. Is folder ki **sab files ek sath select** karke (Ctrl+A) upload box mein drop kar dein — koi folder nahi banega, sab files seedha root mein rahengi, yehi sahi hai
4. **Commit changes** dabayein
5. Settings → Pages mein jaakar dobara check karein — kuch minute baad live link kaam karega

## Supabase Setup (agar pehle nahi kiya)
1. `schema.sql` Supabase SQL Editor mein run karein
2. Storage mein `product-images` naam ka Public bucket banayein
3. `supabase-client.js` mein apni Project URL aur anon key pehle se dali hui hai — agar naya Supabase project banaya hai to yahan update kar lein

## Admin Account Banana
1. Website (`signup.html`) se apni email/password se signup karein
2. Supabase dashboard → Authentication → Users mein apna UID copy karein
3. SQL Editor mein: `insert into admins (id, email) values ('UID-YAHAN', 'aapki-email');`
4. `admin-login.html` se login karein
