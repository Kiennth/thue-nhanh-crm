import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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
      product,
    });
  }
  return result;
}

const customerCache = new Map(); // booqable customer id -> our customer id
async function fetchBqCustomer(customerId) {
  const r = await bqFetch(`${BQ_BASE}/customers/${customerId}`);
  const j = await r.json();
  return j.data;
}

const NO_CUSTOMER_KEY = "__no_customer__";

async function getOrCreateCustomer(bqCustomerId, existingByPhone, existingByName) {
  const cacheKey = bqCustomerId || NO_CUSTOMER_KEY;
  if (customerCache.has(cacheKey)) return customerCache.get(cacheKey);

  // Một số đơn Booqable rất cũ không gắn khách hàng nào (customer_id null).
  const bq = bqCustomerId ? await fetchBqCustomer(bqCustomerId) : null;
  const name = bq?.attributes?.name?.trim() || "Khách lẻ";
  const phone = normalizePhone(bq?.attributes?.properties?.phone);
  const nameKey = normalize(name);

  let customerId = null;
  if (phone && existingByPhone.has(phone)) {
    customerId = existingByPhone.get(phone);
  } else if (existingByName.has(nameKey)) {
    customerId = existingByName.get(nameKey);
  } else {
    const customerType = bq?.attributes?.legal_type === "commercial" ? "company" : "individual";
    const { data, error } = await db
      .from("customers")
      .insert({
        name,
        phone: bq?.attributes?.properties?.phone || null,
        customer_type: customerType,
        deposit_percentage: 100,
      })
      .select("id")
      .single();
    if (error) throw new Error("Tạo khách hàng thất bại: " + error.message);
    customerId = data.id;
    if (phone) existingByPhone.set(phone, customerId);
    existingByName.set(nameKey, customerId);
  }

  customerCache.set(cacheKey, customerId);
  return customerId;
}

// equipment_type name (normalized) -> row
async function loadEquipmentTypes() {
  const { data, error } = await db.from("equipment_types").select("id,name,product_type,tracking_type");
  if (error) throw error;
  const map = new Map();
  for (const e of data) map.set(normalize(e.name), e);
  return map;
}

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

async function getOrCreateInstances(equipmentType, branchId, count) {
  const { data: available } = await db
    .from("equipment_instances")
    .select("id")
    .eq("equipment_type_id", equipmentType.id)
    .eq("branch_id", branchId)
    .eq("status", "available")
    .limit(count);

  const ids = (available || []).map((r) => r.id);
  while (ids.length < count) {
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
      });
    } else if (et.product_type === "service") {
      rows.push({
        equipment_type_id: et.id,
        equipment_unit_id: null,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
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
      });
    } else if (et.product_type === "rental" && et.tracking_type === "quantity") {
      const unitId = await getOrCreateEquipmentUnit(et);
      await ensureStockQuantity(unitId, pickupBranchId, line.quantity);
      rows.push({
        equipment_type_id: et.id,
        equipment_unit_id: unitId,
        equipment_instance_id: null,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
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
        });
      }
    }
  }
  return rows;
}

async function importOrder(bqOrder, ctx) {
  const orderCode = "BQ" + bqOrder.attributes.number;
  if (ctx.existingOrderCodes.has(orderCode)) {
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
  const startsAtDate = toVNDate(bqOrder.attributes.starts_at);
  const stopsAtDate = toVNDate(bqOrder.attributes.stops_at);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      order_code: orderCode,
      pickup_branch_id: pickupBranchId,
      return_branch_id: returnBranchId,
      customer_id: customerId,
      order_date: createdAtDate,
      rental_start_at: bqOrder.attributes.starts_at,
      rental_end_at: bqOrder.attributes.stops_at,
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

    const { error: completeErr } = await db.from("orders").update({ completed_at: bqOrder.attributes.stops_at }).eq("id", order.id);
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

  const { data: existingOrders } = await db.from("orders").select("order_code").like("order_code", "BQ%");
  const existingOrderCodes = new Set((existingOrders || []).map((o) => o.order_code));

  const { data: allCustomers } = await db.from("customers").select("id,name,phone");
  const customersByPhone = new Map();
  const customersByName = new Map();
  for (const c of allCustomers || []) {
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
    customersByPhone,
    customersByName,
    authedDb,
  };

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
  if (allSkipReasons.length) {
    console.log("\nChi tiết đơn bị bỏ qua:");
    for (const s of allSkipReasons) console.log(`  ${s.orderCode}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error("Script lỗi:", err);
  process.exit(1);
});
