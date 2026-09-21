// ============================================================
// SUPABASE CONFIG — apni Supabase project ki details yahan dalein
// Supabase Dashboard -> Project Settings -> API
// ============================================================
const SUPABASE_URL = "https://uljtejooevxuonfziudy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3kRRIwf2rQ3-YVR95dx0hA_vOOj23Dm";

// WhatsApp number jahan order details forward hongi (country code ke sath, + ke bina)
// e.g. Pakistan number 03001234567 -> "923001234567"
const STORE_WHATSAPP_NUMBER = "923001234567";

// Storage bucket name jo product images ke liye Supabase mein banayenge
const PRODUCT_IMAGE_BUCKET = "product-images";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
