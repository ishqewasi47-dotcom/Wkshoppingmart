// ============================================================
// COMMON HELPERS — har page par load hota hai (supabase-client.js ke baad)
// ============================================================

// Format price as PKR
function fmtPrice(n) {
  return "Rs " + Number(n).toLocaleString("en-PK");
}

// Get logged in user (or null)
async function getCurrentUser() {
  const { data } = await supabaseClient.auth.getUser();
  return data?.user || null;
}

// Check if current user is admin (row exists in admins table)
async function isAdminUser(userId) {
  if (!userId) return false;
  const { data, error } = await supabaseClient
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

// Redirect to login if not authenticated (customer pages)
async function requireCustomerAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// Redirect to admin login if not authenticated admin
async function requireAdminAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "admin-login.html";
    return null;
  }
  const admin = await isAdminUser(user.id);
  if (!admin) {
    alert("Aap admin nahi hain.");
    window.location.href = "index.html";
    return null;
  }
  return user;
}

// Update cart count bubble in header
async function refreshCartCount() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  const user = await getCurrentUser();
  if (!user) { el.textContent = "0"; el.style.display = "none"; return; }
  const { data, error } = await supabaseClient
    .from("cart_items")
    .select("quantity")
    .eq("user_id", user.id);
  if (error || !data) { el.style.display = "none"; return; }
  const total = data.reduce((sum, r) => sum + r.quantity, 0);
  el.textContent = total;
  el.style.display = total > 0 ? "flex" : "none";
}

// Wire up header: search box + admin/login state
async function initHeader() {
  const searchForm = document.getElementById("searchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = document.getElementById("searchInput").value.trim();
      window.location.href = "index.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  const user = await getCurrentUser();
  const accountLink = document.getElementById("accountLink");
  if (accountLink) {
    accountLink.href = user ? "dashboard.html" : "login.html";
    accountLink.title = user ? "Mera Account" : "Login";
  }
  refreshCartCount();
}

// Simple HTML-escape for injecting DB text into innerHTML safely
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Generate a WhatsApp click-to-chat link with prefilled order message
function buildWhatsAppLink(order, items) {
  let msg = `*Naya Order — WK Online Mart*\n`;
  msg += `Order #: ${order.order_number}\n`;
  msg += `Customer: ${order.customer_name || ""}\n`;
  msg += `Phone: ${order.phone}\n`;
  msg += `Address: ${order.shipping_address}\n\n`;
  items.forEach((it) => {
    msg += `- ${it.product_name} x${it.quantity} = ${fmtPrice(it.price * it.quantity)}\n`;
  });
  msg += `\nTotal: ${fmtPrice(order.total_amount)}`;
  const encoded = encodeURIComponent(msg);
  return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encoded}`;
}

document.addEventListener("DOMContentLoaded", initHeader);
