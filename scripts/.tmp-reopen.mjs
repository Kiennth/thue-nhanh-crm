import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const authedDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BQ = process.env.BOOQABLE_API_URL;
const UA = "Mozilla/5.0 (Macintosh) Chrome/126";
const { error: le } = await authedDb.auth.signInWithPassword({ email: "hoapham@thuenhanh.vn", password: "123456789" });
if (le) throw new Error(le.message);
for (const code of ["BQ12441", "BQ12347", "BQ12322", "BQ12247"]) {
  const j = await fetch(`${BQ}/orders?filter[number]=${code.slice(2)}`, { headers: { Authorization: `Bearer ${process.env.BOOQABLE_API_TOKEN}`, "User-Agent": UA, Accept: "application/json" } }).then(r => r.json());
  const bq = j.data[0].attributes;
  const { data: o } = await db.from("orders").select("id").eq("order_code", code).single();
  // 1. mở lại đơn + cập nhật ngày trả theo gia hạn
  let { error } = await db.from("orders").update({ completed_at: null, rental_end_at: bq.stops_at }).eq("id", o.id);
  if (error) throw new Error("reopen: " + error.message);
  // 2. bỏ các khâu sau giao hàng (đơn đang cho thuê lại) — trigger tự đưa status về vận hành
  ({ error } = await db.from("order_tasks").delete().eq("order_id", o.id)
    .in("task_type", ["van_hanh_xu_ly_su_co", "thu_hoi", "nghiem_thu", "nhap_kho_bao_tri"]));
  if (error) throw new Error("tasks: " + error.message);
  // 3. hàng đang ở chỗ khách — ghi lại xuất kho
  const { error: de } = await authedDb.rpc("deliver_order_stock", { p_order_id: o.id });
  if (de) console.log(code, "deliver cảnh báo:", de.message);
  const { data: chk } = await db.from("orders").select("order_code,status,completed_at,rental_end_at").eq("id", o.id).single();
  console.log(chk);
}
