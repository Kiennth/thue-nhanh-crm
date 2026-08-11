// Đồng bộ DANH MỤC từ Booqable sang CRM (CEO yêu cầu 2026-08-11):
//   1. Khách hàng: khách có bên Booqable mà CRM chưa có (khớp SĐT trước,
//      tên sau — cùng logic getOrCreateCustomer của import đơn hàng).
//   2. Thiết bị: sản phẩm Booqable chưa có trong equipment_types (khớp tên
//      chuẩn hoá). Tạo mặc định: cho thuê / theo số lượng / giá từ Booqable
//      — CEO rà lại loại/tracking/giá trong UI sau (script in danh sách).
// Idempotent: chạy lại bao nhiêu lần cũng không tạo trùng.
// Cách chạy: node scripts/sync-booqable-catalog.mjs
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const BQ_BASE = process.env.BOOQABLE_API_URL;
const BQ_TOKEN = process.env.BOOQABLE_API_TOKEN;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return (s || "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}
function normalizePhone(s) {
  return (s || "").replace(/[^\d]/g, "");
}

async function bqFetch(url, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${BQ_TOKEN}`, Accept: "application/json" },
    });
    if (r.status === 429) {
      await sleep(1000 * (i + 1));
      continue;
    }
    if (!r.ok) throw new Error(`Booqable API ${r.status}: ${url}`);
    return r.json();
  }
  throw new Error("Booqable API: too many retries " + url);
}

async function bqFetchAll(path) {
  let page = 1;
  const all = [];
  while (true) {
    const j = await bqFetch(`${BQ_BASE}/${path}${path.includes("?") ? "&" : "?"}page[size]=100&page[number]=${page}`);
    if (!j.data?.length) break;
    all.push(...j.data);
    if (j.data.length < 100) break;
    page++;
  }
  return all;
}

async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error("Supabase: " + error.message);
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function syncCustomers() {
  console.log("=== KHÁCH HÀNG ===");
  const [bqCustomers, crmCustomers] = await Promise.all([
    bqFetchAll("customers"),
    fetchAllRows(() => db.from("customers").select("id, name, phone").order("id")),
  ]);
  const byPhone = new Map();
  const byName = new Map();
  for (const c of crmCustomers) {
    const p = normalizePhone(c.phone);
    if (p) byPhone.set(p, c.id);
    byName.set(normalize(c.name), c.id);
  }
  console.log(`Booqable: ${bqCustomers.length} khách | CRM: ${crmCustomers.length} khách`);

  let created = 0;
  for (const bq of bqCustomers) {
    const a = bq.attributes;
    if (a.archived) continue;
    const name = a.name?.trim();
    if (!name) continue;
    const phone = normalizePhone(a.properties?.phone);
    if (phone && byPhone.has(phone)) continue;
    if (byName.has(normalize(name))) continue;

    const { data, error } = await db
      .from("customers")
      .insert({
        name,
        phone: a.properties?.phone || null,
        email: a.email || null,
        customer_type: a.legal_type === "commercial" ? "company" : "individual",
        deposit_percentage: 100,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ❌ ${name}: ${error.message}`);
      continue;
    }
    if (phone) byPhone.set(phone, data.id);
    byName.set(normalize(name), data.id);
    created++;
    console.log(`  ✅ ${name}${a.properties?.phone ? " · " + a.properties.phone : ""}`);
  }
  console.log(`Khách mới tạo: ${created}`);
  return created;
}

async function syncProducts() {
  console.log("\n=== THIẾT BỊ ===");
  // Đồng bộ theo NHÓM sản phẩm (product_groups), không phải từng biến thể
  // (/products) — CRM cố tình gộp biến thể vào 1 loại hàng từ đợt dọn SKU;
  // đồng bộ theo /products sẽ tạo cả nghìn loại trùng kiểu "- Màu Đen/Trắng"
  // (đã dính 1 lần 2026-08-11, phải xoá 853 dòng).
  const [bqProducts, crmTypes] = await Promise.all([
    bqFetchAll("product_groups"),
    fetchAllRows(() => db.from("equipment_types").select("id, name").order("id")),
  ]);
  const typeByName = new Map(crmTypes.map((t) => [normalize(t.name), t.id]));
  console.log(`Booqable: ${bqProducts.length} nhóm sản phẩm | CRM: ${crmTypes.length} loại hàng`);

  // "Thiết bị MỚI" = nhóm sản phẩm tạo bên Booqable từ 01/07/2026 trở đi
  // (sau khi CRM dựng danh mục chọn lọc). KHÔNG kéo cả nghìn nhóm lịch sử
  // chưa từng được chọn vào CRM — lần thử đầu ra 571 nhóm cũ + gần-trùng
  // khác tên, phải xoá sạch (2026-08-11).
  const NEW_SINCE = "2026-07-01";
  let created = 0;
  let skippedOld = 0;
  const createdNames = [];
  for (const bq of bqProducts) {
    const a = bq.attributes;
    if (a.archived) continue;
    const name = a.name?.trim();
    if (!name || typeByName.has(normalize(name))) continue;
    if (!a.created_at || a.created_at < NEW_SINCE) {
      skippedOld++;
      continue;
    }

    const price = a.base_price_in_cents != null ? a.base_price_in_cents / 100 : 0;
    // Constraint equipment_types_type_consistency: rental bắt buộc đủ bộ
    // tracking + pricing_method + rental_period_unit; pricing_structure kèm
    // pricing_template_id. Dùng combo phổ biến nhất trong catalog hiện tại
    // (pricing_structure/day + template "80% Thang" — 416/429 loại).
    const { data, error } = await db
      .from("equipment_types")
      .insert({
        name,
        product_type: "rental",
        tracking_type: "quantity",
        pricing_method: "pricing_structure",
        rental_period_unit: "day",
        pricing_template_id: "88a44846-ec1d-46bb-b508-09d5c5f60a78",
        price,
        deposit_amount: 0,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ❌ ${name}: ${error.message}`);
      continue;
    }
    typeByName.set(normalize(name), data.id);
    created++;
    createdNames.push(`${name} (giá ${price.toLocaleString("vi-VN")}đ)`);
    console.log(`  ✅ ${name} · giá ${price.toLocaleString("vi-VN")}đ`);
  }
  console.log(`Thiết bị mới tạo: ${created} (bỏ qua ${skippedOld} nhóm cũ trước ${NEW_SINCE} chưa từng đưa vào CRM)`);
  if (createdNames.length) {
    console.log("⚠ Các loại mới đều tạo mặc định CHO THUÊ / THEO SỐ LƯỢNG / cọc 0đ — rà lại trong UI nếu cần.");
  }
  return created;
}

const customers = await syncCustomers();
const products = await syncProducts();
console.log(`\n=== XONG: ${customers} khách mới, ${products} thiết bị mới ===`);
