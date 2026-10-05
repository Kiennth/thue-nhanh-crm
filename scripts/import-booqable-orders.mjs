import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BQ_BASE = process.env.BOOQABLE_API_URL;
const BQ_TOKEN = process.env.BOOQABLE_API_TOKEN;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Supabase/PostgREST caps a plain .select() at 1000 rows — paginate with
// .range() to fetch every row for tables that can exceed that. Takes a
// factory (not a built query) since a query builder can't be safely re-run
// after being awaited once.
async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error("Truy vấn Supabase thất bại: " + error.message);
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const RPC_OPERATOR_EMAIL = "hoapham@thuenhanh.vn";
const RPC_OPERATOR_PASSWORD = "123456789";
const CEO_EMAIL = "ceo@thuenhanh.vn";

const BRANCH_BY_LOCATION_NAME = {
  "Đà Nẵng": null, // filled at runtime
  "Hà Nội": null,
  "TP HCM": null,
};

const TASK_TYPE_SEQUENCE = [
  "tiep_nhan_yeu_cau",
  "bao_gia",
  "chot_don",
  "ky_hop_dong_thu_coc",
  "chuan_bi",
  "giao_hang_ban_giao",
  "van_hanh_xu_ly_su_co",
  "thu_hoi",
  "nghiem_thu",
  "nhap_kho_bao_tri",
];

const STATUS_TASK_CUTOFF = {
  reserved: 4, // tiep_nhan_yeu_cau..ky_hop_dong_thu_coc
  started: 6, // ..giao_hang_ban_giao
  stopped: 10, // all
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return (s || "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhone(s) {
  return (s || "").replace(/[^\d]/g, "");
}

// GIỜ BOOQABLE (CEO xác nhận 2026-10-03): giao diện Booqable hiện & nhận giờ
// theo UTC dù cài đặt ghi Bangkok — nhân viên gõ giờ VN, API trả về chính số
// đó kèm "+00:00". Tức starts_at/stops_at là GIỜ VN dán nhãn UTC → phải lùi
// 7 tiếng mới ra thời điểm thật. created_at/updated_at thì là UTC thật.
function bqWallToInstant(isoString) {
  if (!isoString) return null;
  return new Date(Date.parse(isoString) - 7 * 3600 * 1000).toISOString();
}
// Ngày (VN) của giờ nhận/trả Booqable = phần ngày của nhãn (đã là giờ VN).
function bqWallDate(isoString) {
  return isoString ? isoString.slice(0, 10) : null;
}

function toVNDate(isoString) {
  if (!isoString) return null;
  const d = new Date(new Date(isoString).getTime() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function slug(name) {
  return normalize(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
    .toUpperCase();
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
    return r;
  }
  throw new Error("Booqable API: too many retries " + url);
}

async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchMonthOrders(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}T23:59:59+07:00`;
  let page = 1;
  const orders = [];
  while (true) {
    const url =
      `${BQ_BASE}/orders?filter[starts_at][gte]=${start}` +
      `&filter[starts_at][lte]=${end}&page[size]=100&page[number]=${page}`;
    const r = await bqFetch(url);
    const j = await r.json();
    if (!j.data?.length) break;
    orders.push(...j.data.filter((d) => ["reserved", "started", "stopped"].includes(d.attributes.status)));
    if (j.data.length < 100) break;
    page++;
  }
  return orders;
}

const productCache = new Map(); // booqable item id -> product resource (or null if not found)
async function fetchBqProduct(itemId) {
  if (productCache.has(itemId)) return productCache.get(itemId);
  const r = await bqFetch(`${BQ_BASE}/products/${itemId}`);
  const product = r.ok ? (await r.json()).data : null;
  productCache.set(itemId, product);
  return product;
}

async function fetchOrderLines(orderId) {
  const r = await bqFetch(`${BQ_BASE}/lines?filter[order_id]=${orderId}&page[size]=100`);
  const j = await r.json();
  const lines = (j.data || []).filter(
    (l) => l.attributes.line_type !== "discount" && !l.attributes.archived && l.attributes.quantity > 0,
  );
  const result = [];
  for (const l of lines) {
    const product = l.attributes.item_id ? await fetchBqProduct(l.attributes.item_id) : null;
    result.push({
      itemId: l.attributes.item_id,
      title: l.attributes.title,
      quantity: l.attributes.quantity,
      unitPriceCents: l.attributes.price_each_in_cents,
      lineTotalCents: l.attributes.price_in_cents,
      // Ghi chú dưới dòng của Booqable ("Kèm Remote | Dây nguồn", địa chỉ + SĐT
      // giao hàng...) — trước 2026-09-30 bị bỏ lại, nhân viên phải mở Booqable.
      extraInformation: l.attributes.extra_information?.trim() || null,
      product,
    });
  }
  return result;
}

const customerCache = new Map(); // booqable customer id -> our customer id
// MST khách: Booqable không có trường riêng, nhân viên ghi vào ô First Name
// (đôi khi Last Name) của địa chỉ — "MST: 0319409541", "Mã số thuế: ...",
// số trần, mã chi nhánh "0101799205-001". Bỏ CCCD/CMND và SĐT 10 số không
// kèm chữ MST. (CEO 2026-10-01, đợt quét đầu điền 950 khách.)
function extractTaxCode(included) {
  for (const p of included || []) {
    if (p.type !== "properties" || p.attributes?.property_type !== "address") continue;
    for (const text of [p.attributes.first_name, p.attributes.last_name]) {
      if (!text || /cccd|cmnd|căn cước/i.test(text)) continue;
      for (const m of text.matchAll(/(?<!\d)(\d{10}(?:\s*-\s*\d{3})?)(?!\d)/g)) {
        const code = m[1].replace(/\s/g, "");
        if (/^0[35789]\d{8}$/.test(code) && !/mst|thuế|tax/i.test(text)) continue;
        return code;
      }
    }
  }
  return null;
}

async function fetchBqCustomer(customerId) {
  const r = await bqFetch(`${BQ_BASE}/customers/${customerId}?include=properties`);
  if (r.ok) {
    const j = await r.json();
    return { ...j.data, taxCode: extractTaxCode(j.included) };
  }
  // Endpoint chi tiết bị Booqable chặn 402 (gói hết hạn mức, 2026-09-08) —
  // endpoint DANH SÁCH vẫn trả đủ attributes, tra qua filter[id] thay thế.
  // Không được thả trôi về "Khách lẻ" khi Booqable vẫn có dữ liệu khách.
  const r2 = await bqFetch(`${BQ_BASE}/customers?filter[id]=${customerId}&include=properties`);
  if (r2.ok) {
    const j2 = await r2.json();
    if (j2.data?.length) return { ...j2.data[0], taxCode: extractTaxCode(j2.included) };
  }
  throw new Error(`Không tra được khách Booqable ${customerId} (HTTP ${r.status}/${r2.status})`);
}

const NO_CUSTOMER_KEY = "__no_customer__";
// Nạp ở main(): MST → id khách, id → tên khách (cho luật khớp khách ở dưới).
const customersByTaxCode = new Map();
const customerNameById = new Map();

async function getOrCreateCustomer(bqCustomerId, existingByPhone, existingByName) {
  const cacheKey = bqCustomerId || NO_CUSTOMER_KEY;
  if (customerCache.has(cacheKey)) return customerCache.get(cacheKey);

  // Một số đơn Booqable rất cũ không gắn khách hàng nào (customer_id null).
  const bq = bqCustomerId ? await fetchBqCustomer(bqCustomerId) : null;
  const name = bq?.attributes?.name?.trim() || "Khách lẻ";
  const phone = normalizePhone(bq?.attributes?.properties?.phone);
  const nameKey = normalize(name);

  // Thứ tự khớp (CEO 2026-10-03, BQ13100 Gemini bị gán nhầm NINA NGUYỄN vì
  // chung SĐT người liên lạc): 1) cùng MST, 2) đúng tên, 3) cùng SĐT — nhưng
  // nếu khách BQ là công ty (có MST/legal_type commercial) mà tên khác hẳn
  // khách CRM cùng SĐT thì là pháp nhân khác → tạo khách mới.
  // (Khớp SĐT vẫn giữ cho khách cá nhân — vd đơn ghi tên người liên lạc của
  // CMECH, xem memory "tên khách lệch BQ↔CRM".)
  let customerId = null;
  const isCompany = !!bq?.taxCode || bq?.attributes?.legal_type === "commercial";
  const phoneMatch = phone && existingByPhone.has(phone) ? existingByPhone.get(phone) : null;
  const phoneMatchName = phoneMatch ? customerNameById.get(phoneMatch) : null;
  if (bq?.taxCode && customersByTaxCode.has(bq.taxCode)) {
    customerId = customersByTaxCode.get(bq.taxCode);
  } else if (
    phoneMatch &&
    !existingByName.has(nameKey) &&
    !(isCompany && phoneMatchName && normalize(phoneMatchName) !== nameKey)
  ) {
    customerId = phoneMatch;
  } else if (existingByName.has(nameKey)) {
    customerId = existingByName.get(nameKey);
    // Khách đã có (khớp đúng tên) mà CRM chưa có MST → điền từ Booqable.
    // Không làm với khớp SĐT: người liên lạc chung, MST có thể của pháp nhân khác.
    if (bq?.taxCode) {
      await db
        .from("customers")
        .update({ tax_code: bq.taxCode })
        .eq("id", customerId)
        .or("tax_code.is.null,tax_code.eq.");
    }
    // Email: CRM trước 2026-10-01 không lưu email khách Booqable → ô chọn
    // khách khi tạo đơn không tìm theo email được. Điền khi CRM còn trống.
    const bqEmail = bq?.attributes?.email?.trim();
    if (bqEmail) {
      await db
        .from("customers")
        .update({ email: bqEmail })
        .eq("id", customerId)
        .or("email.is.null,email.eq.");
    }
  } else {
    const customerType = bq?.attributes?.legal_type === "commercial" ? "company" : "individual";
    const { data, error } = await db
      .from("customers")
      .insert({
        name,
        phone: bq?.attributes?.properties?.phone || null,
        customer_type: bq?.taxCode ? "company" : customerType,
        tax_code: bq?.taxCode ?? null,
        email: bq?.attributes?.email?.trim() || null,
        deposit_percentage: 100,
      })
      .select("id")
      .single();
    if (error) throw new Error("Tạo khách hàng thất bại: " + error.message);
    customerId = data.id;
    if (phone && !existingByPhone.has(phone)) existingByPhone.set(phone, customerId);
    existingByName.set(nameKey, customerId);
    customerNameById.set(customerId, name);
    if (bq?.taxCode) customersByTaxCode.set(bq.taxCode, customerId);
  }

  customerCache.set(cacheKey, customerId);
  return customerId;
}

// equipment_type name (normalized) -> row
async function loadEquipmentTypes() {
  const data = await fetchAllRows(() =>
    db.from("equipment_types").select("id,name,product_type,tracking_type").order("id"),
  );
  const map = new Map();
  for (const e of data) map.set(normalize(e.name), e);
  // Tên cũ (trùng tên sản phẩm bên Booqable) của mã đã đổi tên trong CRM —
  // vẫn tự gắn đúng mã khi đồng bộ.
  for (const [oldName, newName] of Object.entries(RENAMED_TYPES)) {
    const e = map.get(normalize(newName));
    if (e && !map.has(normalize(oldName))) map.set(normalize(oldName), e);
  }
  return map;
}

// CEO 2026-10-04: thêm chữ "PlayStation" để tìm "playstation" ra tay cầm.
const RENAMED_TYPES = {
  "Tay cầm PS4 Sony DUALSHOCK": "Tay cầm PlayStation 4 PS4 Sony DUALSHOCK",
  "Tay cầm Sony DualSense": "Tay cầm PlayStation 5 PS5 Sony DualSense",
};

const equipmentUnitCache = new Map(); // equipment_type_id -> equipment_unit_id
async function getOrCreateEquipmentUnit(equipmentType) {
  if (equipmentUnitCache.has(equipmentType.id)) return equipmentUnitCache.get(equipmentType.id);
  const { data: existing } = await db
    .from("equipment_units")
    .select("id")
    .eq("equipment_type_id", equipmentType.id)
    .limit(1);
  let unitId;
  if (existing?.length) {
    unitId = existing[0].id;
  } else {
    const { data, error } = await db
      .from("equipment_units")
      .insert({ equipment_type_id: equipmentType.id, brand_model: equipmentType.name })
      .select("id")
      .single();
    if (error) throw new Error("Tạo equipment_unit thất bại: " + error.message);
    unitId = data.id;
  }
  equipmentUnitCache.set(equipmentType.id, unitId);
  return unitId;
}

async function ensureStockQuantity(equipmentUnitId, branchId, neededQuantity) {
  const { data: existing } = await db
    .from("equipment_stock")
    .select("id,quantity_in_stock")
    .eq("equipment_unit_id", equipmentUnitId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (!existing) {
    const { error } = await db
      .from("equipment_stock")
      .insert({ equipment_unit_id: equipmentUnitId, branch_id: branchId, quantity_in_stock: neededQuantity });
    if (error) throw new Error("Tạo equipment_stock thất bại: " + error.message);
    return;
  }
  if (existing.quantity_in_stock < neededQuantity) {
    const { error } = await db
      .from("equipment_stock")
      .update({ quantity_in_stock: neededQuantity })
      .eq("id", existing.id);
    if (error) throw new Error("Cập nhật equipment_stock thất bại: " + error.message);
  }
}

// Chế độ --resync: ưu tiên dùng lại đúng các máy đơn đang gắn (giữ serial
// nhân viên đã chọn), không tự nâng tồn kho số lượng.
const resyncState = { preferredInstances: new Map(), skipStockBump: false };

async function getOrCreateInstances(equipmentType, branchId, count) {
  const pool = resyncState.preferredInstances.get(equipmentType.id) || [];
  const reused = pool.splice(0, count);
  if (reused.length >= count) return reused;
  count -= reused.length;
  const { data: available } = await db
    .from("equipment_instances")
    .select("id")
    .eq("equipment_type_id", equipmentType.id)
    .eq("branch_id", branchId)
    .eq("status", "available")
    .limit(count);

  const ids = [...reused, ...(available || []).map((r) => r.id).filter((id) => !reused.includes(id))];
  while (ids.length < count + reused.length) {
    const code = `AUTO-${slug(equipmentType.name)}-${randomUUID().slice(0, 8)}`;
    const { data, error } = await db
      .from("equipment_instances")
      .insert({ equipment_type_id: equipmentType.id, identifier_code: code, branch_id: branchId, status: "available" })
      .select("id")
      .single();
    if (error) throw new Error("Tạo equipment_instance thất bại: " + error.message);
    ids.push(data.id);
  }
  return ids;
}

// Returns array of order_equipment row payloads (without order_id). Every
// line resolves to something — either a catalog-linked row, or (when there's
// no linked Booqable product, or its name doesn't match our catalog, or its
// product_type/tracking_type combination isn't one we handle) a "custom"
// free-text row (equipment_type_id null, custom_name set) — so no order is
// ever skipped wholesale just because one line lacks a catalog match.
async function resolveOrderLines(bqLines, equipmentTypeMap, pickupBranchId) {
  const rows = [];
  for (const line of bqLines) {
    const unitPrice = line.unitPriceCents / 100;
    const lineTotal = line.lineTotalCents / 100;
    const et = line.product ? equipmentTypeMap.get(normalize(line.product.attributes.name)) : null;
    const isHandledTracking =
      et?.product_type !== "rental" || et.tracking_type === "quantity" || et.tracking_type === "individual";

    if (!et || !isHandledTracking) {
      rows.push({
        equipment_type_id: null,
        custom_name: line.product?.attributes?.name || line.title || "Dòng hàng Booqable",
        equipment_unit_id: null,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        extra_information: line.extraInformation,
      });
    } else if (et.product_type === "service") {
      rows.push({
        equipment_type_id: et.id,
        equipment_unit_id: null,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        extra_information: line.extraInformation,
      });
    } else if (et.product_type === "sale") {
      // order_equipment_check_line requires equipment_unit_id for 'sale' too.
      const unitId = await getOrCreateEquipmentUnit(et);
      rows.push({
        equipment_type_id: et.id,
        equipment_unit_id: unitId,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        extra_information: line.extraInformation,
      });
    } else if (et.product_type === "rental" && et.tracking_type === "quantity") {
      const unitId = await getOrCreateEquipmentUnit(et);
      if (!resyncState.skipStockBump) await ensureStockQuantity(unitId, pickupBranchId, line.quantity);
      rows.push({
        equipment_type_id: et.id,
        equipment_unit_id: unitId,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        extra_information: line.extraInformation,
      });
    } else if (et.product_type === "rental" && et.tracking_type === "individual") {
      const instanceIds = await getOrCreateInstances(et, pickupBranchId, line.quantity);
      const perUnitTotal = lineTotal / line.quantity;
      for (const instanceId of instanceIds) {
        rows.push({
          equipment_type_id: et.id,
          equipment_unit_id: null,
          equipment_instance_id: instanceId,
          quantity: 1,
          unit_price: unitPrice,
          line_total: perUnitTotal,
          extra_information: line.extraInformation,
        });
      }
    }
  }
  return rows;
}

// Đơn đã nhập từ trước: trước 2026-10-03 script bỏ qua hẳn → nhân viên sửa
// giờ nhận/trả bên Booqable sau khi nhập thì CRM giữ giờ cũ (CEO báo "mấy đơn
// hôm nay 2 bên lệch giờ"). Giờ: đơn CRM còn mở hoặc mới xong ≤7 ngày mà giờ
// lệch Booqable thì cập nhật theo Booqable. Chỉ đụng giờ thuê, không đụng
// dòng hàng/tiền.
async function syncOpenOrderTimes(bqOrder, orderCode, ctx) {
  const crm = ctx.existingOrders.get(orderCode);
  // Đơn đã xong lâu thì để nguyên (sổ sách đã chốt); đơn mới xong trong 7
  // ngày vẫn chỉnh — bước "đóng đơn" chạy sau import nên đơn vừa trả hôm nay
  // có thể đã bị đóng với giờ cũ.
  const recentlyDone = crm.completed_at && Date.now() - Date.parse(crm.completed_at) < 7 * 86_400_000;
  if (!crm || crm.cancelled_at || (crm.completed_at && !recentlyDone)) return;
  const starts_at = bqWallToInstant(bqOrder.attributes.starts_at);
  const stops_at = bqWallToInstant(bqOrder.attributes.stops_at);
  if (!starts_at || !stops_at) return;
  const same = (a, b) => a && b && Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;
  if (same(crm.rental_start_at, starts_at) && same(crm.rental_end_at, stops_at)) return;
  // CEO 2026-10-05: giờ đã có người sửa tay trong CRM (actor_id có trong
  // activity_log) thì CRM là gốc — không lấy giờ Booqable đè lên (BQ13084 bị
  // đè 2 lần trong ngày).
  const { data: logs } = await db
    .from("activity_log")
    .select("old_s:old_data->>rental_start_at, new_s:new_data->>rental_start_at, old_e:old_data->>rental_end_at, new_e:new_data->>rental_end_at")
    .eq("table_name", "orders")
    .eq("record_id", crm.id)
    .eq("action", "update")
    .not("actor_id", "is", null)
    .limit(200);
  const editedInCrm = (logs ?? []).some((l) => l.old_s !== l.new_s || l.old_e !== l.new_e);
  if (editedInCrm) {
    console.log(`  ✋ ${orderCode} giữ giờ CRM (đã sửa tay trong CRM) — Booqable: ${starts_at} / ${stops_at}`);
    return;
  }
  const { error } = await db
    .from("orders")
    .update({ rental_start_at: starts_at, rental_end_at: stops_at })
    .eq("id", crm.id);
  if (error) {
    console.log(`  ⚠️ ${orderCode} không cập nhật được giờ: ${error.message}`);
    return;
  }
  ctx.timeUpdates.push(orderCode);
  console.log(
    `  🕒 ${orderCode} cập nhật giờ theo Booqable: ${crm.rental_start_at} → ${starts_at} / ${crm.rental_end_at} → ${stops_at}`,
  );
}

// --resync BQ1,BQ2,...: làm lại TOÀN BỘ dòng hàng của đơn đã nhập theo
// Booqable hiện tại (CEO 2026-10-03 — đơn bị sửa món trên Booqable sau khi
// nhập). Đơn đã giao chưa trả: hoàn tác xuất kho → thay dòng → xuất kho lại.
// Đơn đã xong/chưa giao: chỉ thay dòng (tồn kho không đổi). Giữ lại máy
// serial đang gắn nếu cùng sản phẩm. Thanh toán, khâu, khách giữ nguyên.
const resyncBackup = {};
async function resyncOrders(codes, ctx) {
  resyncState.skipStockBump = true;
  for (const code of codes) {
    const { data: crm } = await db
      .from("orders")
      .select("id,pickup_branch_id,delivery_stock_moved_at,completed_at,cancelled_at,total_value")
      .eq("order_code", code)
      .single();
    if (!crm) { console.log(code, "không thấy trong CRM"); continue; }
    const found = await bqFetch(`${BQ_BASE}/orders?filter[number]=${code.slice(2)}`).then((r) => r.json());
    const bqOrder = found.data?.[0];
    if (!bqOrder) { console.log(code, "không thấy trên Booqable"); continue; }
    const bqLines = await fetchOrderLines(bqOrder.id);
    const { data: oldLines } = await db
      .from("order_equipment")
      .select("*")
      .eq("order_id", crm.id);
    resyncBackup[code] = oldLines;
    writeFileSync(process.env.RESYNC_BACKUP || "resync-backup.json", JSON.stringify(resyncBackup, null, 1));
    resyncState.preferredInstances = new Map();
    for (const l of oldLines || []) {
      if (!l.equipment_instance_id) continue;
      const list = resyncState.preferredInstances.get(l.equipment_type_id) || [];
      list.push(l.equipment_instance_id);
      resyncState.preferredInstances.set(l.equipment_type_id, list);
    }
    const delivered = !!crm.delivery_stock_moved_at && !crm.completed_at && !crm.cancelled_at;
    if (delivered) {
      const { error } = await ctx.authedDb.rpc("undo_deliver_order_stock", { p_order_id: crm.id });
      if (error) { console.log(code, "hoàn tác xuất kho lỗi:", error.message); continue; }
    }
    for (const l of (oldLines || []).filter((x) => x.parent_line_id)) await db.from("order_equipment").delete().eq("id", l.id);
    for (const l of (oldLines || []).filter((x) => !x.parent_line_id)) await db.from("order_equipment").delete().eq("id", l.id);
    const rows = await resolveOrderLines(bqLines, ctx.equipmentTypeMap, crm.pickup_branch_id);
    for (const row of rows) {
      const { error } = await db.from("order_equipment").insert({ ...row, order_id: crm.id });
      if (error) throw new Error(`${code} thêm dòng lỗi: ${error.message}`);
    }
    if (delivered) {
      const { error } = await ctx.authedDb.rpc("deliver_order_stock", { p_order_id: crm.id });
      if (error) console.log(code, "xuất kho lại lỗi:", error.message);
    }
    const { data: after } = await db.from("orders").select("total_value").eq("id", crm.id).single();
    console.log(
      `${code}: ${oldLines?.length ?? 0} dòng cũ → ${rows.length} dòng mới | ${crm.total_value} → ${after?.total_value} (BQ ${bqOrder.attributes.price_in_cents / 100})${delivered ? " | đã xuất kho lại" : ""}`,
    );
  }
}

async function importOrder(bqOrder, ctx) {
  const orderCode = "BQ" + bqOrder.attributes.number;
  if (ctx.existingOrderCodes.has(orderCode)) {
    await syncOpenOrderTimes(bqOrder, orderCode, ctx);
    return { skipped: false, alreadyImported: true, orderCode };
  }

  const status = bqOrder.attributes.status;
  const lines = await fetchOrderLines(bqOrder.id);
  if (!lines.length) return { skipped: true, orderCode, reason: "Đơn không có dòng hàng" };

  const pickupBranchId = ctx.branchByLocationId.get(bqOrder.attributes.start_location_id);
  const returnBranchId = ctx.branchByLocationId.get(bqOrder.attributes.stop_location_id) || pickupBranchId;
  if (!pickupBranchId) return { skipped: true, orderCode, reason: "Không xác định được chi nhánh" };

  const orderEquipmentRows = await resolveOrderLines(lines, ctx.equipmentTypeMap, pickupBranchId);

  const customerId = await getOrCreateCustomer(bqOrder.attributes.customer_id, ctx.customersByPhone, ctx.customersByName);

  const createdAtDate = toVNDate(bqOrder.attributes.created_at);
  const startsAtDate = bqWallDate(bqOrder.attributes.starts_at);
  const stopsAtDate = bqWallDate(bqOrder.attributes.stops_at);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      order_code: orderCode,
      pickup_branch_id: pickupBranchId,
      return_branch_id: returnBranchId,
      customer_id: customerId,
      order_date: createdAtDate,
      rental_start_at: bqWallToInstant(bqOrder.attributes.starts_at),
      rental_end_at: bqWallToInstant(bqOrder.attributes.stops_at),
      created_by: ctx.ceoEmployeeId,
    })
    .select("id")
    .single();
  if (orderErr) throw new Error("Tạo đơn hàng thất bại: " + orderErr.message);

  for (const row of orderEquipmentRows) {
    const { error } = await db.from("order_equipment").insert({ ...row, order_id: order.id });
    if (error) throw new Error("Tạo order_equipment thất bại: " + error.message);
  }

  const cutoff = STATUS_TASK_CUTOFF[status];
  for (let i = 0; i < cutoff; i++) {
    const taskType = TASK_TYPE_SEQUENCE[i];
    let completedDate;
    if (i < 4) completedDate = createdAtDate;
    else if (i < 6) completedDate = startsAtDate;
    else completedDate = stopsAtDate;

    const { error } = await db.from("order_tasks").insert({
      order_id: order.id,
      task_type: taskType,
      employee_id: ctx.ceoEmployeeId,
      completed_date: completedDate,
    });
    if (error) throw new Error(`Tạo order_task (${taskType}) thất bại: ` + error.message);
  }

  if (status === "started" || status === "stopped") {
    const { error } = await ctx.authedDb.rpc("deliver_order_stock", { p_order_id: order.id });
    if (error) throw new Error("deliver_order_stock thất bại: " + error.message);
  }
  if (status === "stopped") {
    const { error: returnErr } = await ctx.authedDb.rpc("return_order_stock", { p_order_id: order.id });
    if (returnErr) throw new Error("return_order_stock thất bại: " + returnErr.message);

    const { error: completeErr } = await db.from("orders").update({ completed_at: bqWallToInstant(bqOrder.attributes.stops_at) }).eq("id", order.id);
    if (completeErr) throw new Error("Đóng đơn thất bại: " + completeErr.message);
  }

  const paidCents = bqOrder.attributes.amount_paid_in_cents || 0;
  if (paidCents > 0) {
    const { error } = await db.from("order_payments").insert({
      order_id: order.id,
      amount: paidCents / 100,
      method: "chuyen_khoan",
      paid_at: createdAtDate,
      note: "Nhập từ Booqable",
    });
    if (error) throw new Error("Tạo order_payment thất bại: " + error.message);
  }

  ctx.existingOrderCodes.add(orderCode);
  return { skipped: false, alreadyImported: false, orderCode };
}

async function main() {
  console.log("Đăng nhập tài khoản vận hành RPC:", RPC_OPERATOR_EMAIL);
  const authedDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: loginErr } = await authedDb.auth.signInWithPassword({
    email: RPC_OPERATOR_EMAIL,
    password: RPC_OPERATOR_PASSWORD,
  });
  if (loginErr) throw new Error("Đăng nhập thất bại: " + loginErr.message);

  const { data: branches } = await db.from("branches").select("id,name");
  const branchIdByName = new Map(branches.map((b) => [b.name, b.id]));

  const { data: bqLocationsRes } = await bqFetch(`${BQ_BASE}/locations?page[size]=50`).then((r) => r.json());
  const branchByLocationId = new Map();
  for (const loc of bqLocationsRes) {
    const branchId = branchIdByName.get(loc.attributes.name);
    if (branchId) branchByLocationId.set(loc.id, branchId);
  }

  const { data: ceo } = await db.from("employees").select("id").eq("email", CEO_EMAIL).single();
  if (!ceo) throw new Error("Không tìm thấy nhân viên " + CEO_EMAIL);

  const equipmentTypeMap = await loadEquipmentTypes();

  const existingOrderRows = await fetchAllRows(() =>
    db
      .from("orders")
      .select("id,order_code,rental_start_at,rental_end_at,completed_at,cancelled_at")
      .like("order_code", "BQ%")
      .order("id"),
  );
  const existingOrderCodes = new Set(existingOrderRows.map((o) => o.order_code));
  const existingOrders = new Map(existingOrderRows.map((o) => [o.order_code, o]));

  const allCustomers = await fetchAllRows(() => db.from("customers").select("id,name,phone,tax_code").order("id"));
  const customersByPhone = new Map();
  const customersByName = new Map();
  for (const c of allCustomers || []) {
    customerNameById.set(c.id, c.name);
    const tc = (c.tax_code || "").replace(/\s/g, "");
    if (tc && !customersByTaxCode.has(tc)) customersByTaxCode.set(tc, c.id);
    const phone = normalizePhone(c.phone);
    if (phone && !customersByPhone.has(phone)) customersByPhone.set(phone, c.id);
    const nameKey = normalize(c.name);
    if (!customersByName.has(nameKey)) customersByName.set(nameKey, c.id);
  }

  const ctx = {
    branchByLocationId,
    ceoEmployeeId: ceo.id,
    equipmentTypeMap,
    existingOrderCodes,
    existingOrders,
    timeUpdates: [],
    customersByPhone,
    customersByName,
    authedDb,
  };

  // --stock undo|deliver BQ1,BQ2: hoàn tác / xuất kho lại cho đơn đang giao
  // (dùng quanh bước sửa dòng hàng thủ công của đơn đã xuất kho).
  if (process.argv[2] === "--stock") {
    const fn = process.argv[3] === "undo" ? "undo_deliver_order_stock" : "deliver_order_stock";
    for (const code of process.argv[4].split(",")) {
      const { data: o } = await db.from("orders").select("id").eq("order_code", code).single();
      const { error } = await authedDb.rpc(fn, { p_order_id: o.id });
      console.log(code, fn, error ? "LỖI " + error.message : "ok");
    }
    return;
  }

  if (process.argv[2] === "--resync") {
    await resyncOrders(process.argv[3].split(","), ctx);
    return;
  }

  // Two forms: `node script.mjs 2026 7` (single month) or
  // `node script.mjs 2021-03 2026-07` (inclusive month range, run in one process).
  const [, , argA, argB] = process.argv;
  let months = [];
  if (argA?.includes("-")) {
    const [fromY, fromM] = argA.split("-").map(Number);
    const [toY, toM] = (argB || argA).split("-").map(Number);
    let y = fromY;
    let m = fromM;
    while (y < toY || (y === toY && m <= toM)) {
      months.push({ year: y, month: m });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  } else {
    months = [{ year: Number(argA) || 2026, month: Number(argB) || 7 }];
  }

  let totalImported = 0;
  let totalAlreadyImported = 0;
  let totalSkipped = 0;
  const allSkipReasons = [];

  for (const { year, month } of months) {
    console.log(`\n--- Tháng ${month}/${year} ---`);
    const bqOrders = await fetchMonthOrders(year, month);
    console.log(`Tìm thấy ${bqOrders.length} đơn thật.`);

    let imported = 0;
    let alreadyImported = 0;
    let skipped = 0;

    // Sequential (not pooled) to respect Booqable rate limit and DB trigger ordering per order;
    // orders themselves are independent of each other so this is safe to run serially.
    for (const bqOrder of bqOrders) {
      try {
        const result = await importOrder(bqOrder, ctx);
        if (result.alreadyImported) {
          alreadyImported++;
        } else if (result.skipped) {
          skipped++;
          allSkipReasons.push({ orderCode: result.orderCode, reason: result.reason });
        } else {
          imported++;
          console.log(`✅ ${result.orderCode}`);
        }
      } catch (err) {
        skipped++;
        allSkipReasons.push({ orderCode: "BQ" + bqOrder.attributes.number, reason: "Lỗi: " + err.message });
        console.error(`❌ BQ${bqOrder.attributes.number}: ${err.message}`);
      }
    }

    console.log(`Tháng ${month}/${year}: import ${imported}, đã có ${alreadyImported}, bỏ qua ${skipped}`);
    totalImported += imported;
    totalAlreadyImported += alreadyImported;
    totalSkipped += skipped;
  }

  console.log("\n=== Tổng kết ===");
  console.log("Import thành công:", totalImported);
  console.log("Đã import từ trước (bỏ qua):", totalAlreadyImported);
  console.log("Bỏ qua (chưa đủ điều kiện):", totalSkipped);
  console.log("Đơn mở cập nhật giờ theo Booqable:", ctx.timeUpdates.length, ctx.timeUpdates.join(", "));
  if (allSkipReasons.length) {
    console.log("\nChi tiết đơn bị bỏ qua:");
    for (const s of allSkipReasons) console.log(`  ${s.orderCode}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error("Script lỗi:", err);
  process.exit(1);
});
