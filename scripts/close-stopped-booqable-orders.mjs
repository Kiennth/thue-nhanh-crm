// Đóng các đơn CRM còn treo mà Booqable đã stopped (chốt sổ cắt Booqable).
// Per đơn: chèn khâu thiếu (đủ 10) → trigger tự hoàn tất; deliver/return
// stock chỉ gọi khi khâu giao/thu hồi TRƯỚC ĐÓ còn thiếu (tránh chạy đôi);
// completed_at sửa về stops_at Booqable.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authedDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BQ = process.env.BOOQABLE_API_URL;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CEO_EMPLOYEE = "a3a98086-f9f8-46cd-b1f5-6d5e52d8f17f";
const TASKS = [
  "tiep_nhan_yeu_cau", "bao_gia", "chot_don", "ky_hop_dong_thu_coc", "chuan_bi",
  "giao_hang_ban_giao", "van_hanh_xu_ly_su_co", "thu_hoi", "nghiem_thu", "nhap_kho_bao_tri",
];

async function bqFetch(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.BOOQABLE_API_TOKEN}`, "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) return r.json();
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error("Booqable fetch lỗi: " + url);
}

const { error: loginErr } = await authedDb.auth.signInWithPassword({ email: "hoapham@thuenhanh.vn", password: "123456789" });
if (loginErr) throw new Error("Login RPC thất bại: " + loginErr.message);

// 1. đơn CRM còn mở
const open = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("orders")
    .select("id, order_code, order_date, rental_start_at")
    .like("order_code", "BQ%").is("completed_at", null).is("cancelled_at", null)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  open.push(...data);
  if (data.length < 1000) break;
}
console.log("CRM đơn BQ còn mở:", open.length);

// 2. Booqable stopped (stops_at từ 2026-06-01 đổ đi cho phủ cả đơn bắt đầu sớm)
const stopped = new Map();
for (let page = 1; ; page++) {
  const j = await bqFetch(`${BQ}/orders?filter[status]=stopped&filter[stops_at][gte]=2026-06-01T00:00:00%2B07:00&page[size]=100&page[number]=${page}`);
  if (!j.data?.length) break;
  for (const d of j.data) stopped.set("BQ" + d.attributes.number, d.attributes);
  if (j.data.length < 100) break;
}
console.log("Booqable stopped (stops>=06/2026):", stopped.size);

let closed = 0, skippedNoBq = 0, errors = 0;
for (const o of open) {
  const bq = stopped.get(o.order_code);
  if (!bq) { skippedNoBq++; continue; }
  try {
    const { data: tasks, error: tErr } = await db.from("order_tasks").select("task_type").eq("order_id", o.id);
    if (tErr) throw new Error(tErr.message);
    const have = new Set(tasks.map((t) => t.task_type));
    const orderDate = o.order_date;
    const startsDate = (bq.starts_at || o.rental_start_at || orderDate).slice(0, 10);
    const stopsDate = (bq.stops_at || startsDate).slice(0, 10);
    const needDeliver = !have.has("giao_hang_ban_giao");
    const needReturn = !have.has("thu_hoi");
    for (let i = 0; i < 10; i++) {
      if (have.has(TASKS[i])) continue;
      const completed_date = i < 4 ? orderDate : i < 6 ? startsDate : stopsDate;
      const { error } = await db.from("order_tasks").insert({
        order_id: o.id, task_type: TASKS[i], employee_id: CEO_EMPLOYEE, completed_date,
      });
      if (error) throw new Error(`task ${TASKS[i]}: ` + error.message);
    }
    if (needDeliver) {
      const { error } = await authedDb.rpc("deliver_order_stock", { p_order_id: o.id });
      if (error) throw new Error("deliver: " + error.message);
    }
    if (needReturn) {
      const { error } = await authedDb.rpc("return_order_stock", { p_order_id: o.id });
      if (error) throw new Error("return: " + error.message);
    }
    const { error: cErr } = await db.from("orders").update({ completed_at: bq.stops_at }).eq("id", o.id);
    if (cErr) throw new Error("completed_at: " + cErr.message);
    closed++;
    if (closed % 25 === 0) console.log(`... đã đóng ${closed}`);
  } catch (e) {
    errors++;
    console.log("LỖI", o.order_code, "-", e.message);
  }
}
console.log(`\n=== Xong: đóng ${closed}, lỗi ${errors}, còn mở (BQ chưa stopped/không thấy): ${skippedNoBq}`);
