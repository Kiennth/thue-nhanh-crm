// Bước 3 "đồng bộ Booqable": đơn BQ đang mở trong CRM mà bên Booqable đã
// "started" (khách đã nhận máy) → tick đủ 6 khâu tới Giao hàng & bàn giao rồi
// xuất kho; Booqable "canceled" → huỷ đơn CRM. Chỉ đọc Booqable, không ghi.
//
// Không đăng nhập ở đây (không để mật khẩu trong script): in danh sách mã cần
// xuất kho — chạy tiếp `node scripts/import-booqable-orders.mjs --stock deliver <mã,...>`
// (dùng tài khoản vận hành RPC sẵn trong script import). Dòng cuối stdout là
// "DELIVER=<mã,...>" để ghép lệnh.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const BQ = process.env.BOOQABLE_API_URL;
const CEO_EMPLOYEE = "a3a98086-f9f8-46cd-b1f5-6d5e52d8f17f";
const TASKS = ["tiep_nhan_yeu_cau", "bao_gia", "chot_don", "ky_hop_dong_thu_coc", "chuan_bi", "giao_hang_ban_giao"];

const open = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("orders")
    .select("id, order_code, order_date, rental_start_at")
    .like("order_code", "BQ%")
    .is("completed_at", null)
    .is("cancelled_at", null)
    .is("delivered_at", null)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  open.push(...data);
  if (data.length < 1000) break;
}

const deliver = [];
let canceled = 0;
let errors = 0;
for (const o of open) {
  try {
    const j = await fetch(`${BQ}/orders?filter[number]=${o.order_code.slice(2)}`, {
      headers: { Authorization: `Bearer ${process.env.BOOQABLE_API_TOKEN}`, Accept: "application/json" },
    }).then((r) => r.json());
    const bq = j.data?.[0]?.attributes;
    if (!bq) continue;
    if (bq.status === "started") {
      const { data: tasks } = await db.from("order_tasks").select("id, task_type, completed_date").eq("order_id", o.id);
      const byType = new Map(tasks.map((t) => [t.task_type, t]));
      const done = new Set(tasks.filter((t) => t.completed_date).map((t) => t.task_type));
      const startsDate = (bq.starts_at || o.rental_start_at || o.order_date).slice(0, 10);
      for (let i = 0; i < TASKS.length; i++) {
        if (done.has(TASKS[i])) continue;
        const completed_date = i < 4 ? o.order_date : startsDate;
        const existing = byType.get(TASKS[i]);
        const { error } = existing
          ? await db.from("order_tasks").update({ completed_date }).eq("id", existing.id)
          : await db
              .from("order_tasks")
              .insert({ order_id: o.id, task_type: TASKS[i], employee_id: CEO_EMPLOYEE, completed_date });
        if (error) throw new Error(TASKS[i] + ": " + error.message);
      }
      deliver.push(o.order_code);
      console.log("GIAO:", o.order_code);
    } else if (bq.status === "canceled") {
      await db.from("orders").update({ cancelled_at: new Date().toISOString() }).eq("id", o.id);
      canceled++;
      console.log("HUỶ THEO BQ:", o.order_code);
    }
  } catch (e) {
    errors++;
    console.log("LỖI", o.order_code, e.message);
  }
}
console.log(`=== started-sync: giao ${deliver.length}, huỷ ${canceled}, lỗi ${errors}`);
console.log(`DELIVER=${deliver.join(",")}`);
