import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const CODE = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const authedDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const CEO_EMPLOYEE = "a3a98086-f9f8-46cd-b1f5-6d5e52d8f17f";
const TASKS = ["tiep_nhan_yeu_cau","bao_gia","chot_don","ky_hop_dong_thu_coc","chuan_bi","giao_hang_ban_giao","van_hanh_xu_ly_su_co","thu_hoi","nghiem_thu","nhap_kho_bao_tri"];
const { error: le } = await authedDb.auth.signInWithPassword({ email: "hoapham@thuenhanh.vn", password: "123456789" });
if (le) throw new Error(le.message);
const { data: o } = await db.from("orders").select("id, order_date, rental_start_at, rental_end_at").eq("order_code", CODE).single();
const { data: tasks } = await db.from("order_tasks").select("task_type").eq("order_id", o.id);
const have = new Set(tasks.map(t => t.task_type));
const startsDate = (o.rental_start_at || o.order_date).slice(0, 10);
const stopsDate = (o.rental_end_at || startsDate).slice(0, 10);
const needDeliver = !have.has("giao_hang_ban_giao"), needReturn = !have.has("thu_hoi");
for (let i = 0; i < 10; i++) {
  if (have.has(TASKS[i])) continue;
  const { error } = await db.from("order_tasks").insert({ order_id: o.id, task_type: TASKS[i], employee_id: CEO_EMPLOYEE, completed_date: i < 4 ? o.order_date : i < 6 ? startsDate : stopsDate });
  if (error) throw new Error(TASKS[i] + ": " + error.message);
}
if (needDeliver) { const { error } = await authedDb.rpc("deliver_order_stock", { p_order_id: o.id }); if (error) throw new Error("deliver: " + error.message); }
if (needReturn) { const { error } = await authedDb.rpc("return_order_stock", { p_order_id: o.id }); if (error) throw new Error("return: " + error.message); }
const { error: ce } = await db.from("orders").update({ completed_at: o.rental_end_at || o.rental_start_at }).eq("id", o.id);
if (ce) throw new Error(ce.message);
const { data: chk } = await db.from("orders").select("order_code, completed_at, delivered_at").eq("id", o.id).single();
console.log(chk);
