import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

function normalizePhone(s) {
  return (s || "").replace(/[^\d]/g, "");
}

async function main() {
  const customers = await fetchAllRows(() =>
    db.from("customers").select("id,name,phone,created_at").order("id"),
  );
  console.log("Tổng khách hàng:", customers.length);

  const byPhone = new Map();
  for (const c of customers) {
    const phone = normalizePhone(c.phone);
    if (!phone) continue;
    const list = byPhone.get(phone) || [];
    list.push(c);
    byPhone.set(phone, list);
  }
  const dupeGroups = [...byPhone.entries()].filter(([, list]) => list.length > 1);
  console.log("Số SĐT bị trùng:", dupeGroups.length);

  const orderCountById = new Map();
  {
    const orders = await fetchAllRows(() => db.from("orders").select("customer_id").order("id"));
    for (const o of orders) orderCountById.set(o.customer_id, (orderCountById.get(o.customer_id) || 0) + 1);
  }

  let merged = 0;
  let ordersRepointed = 0;

  for (const [phone, group] of dupeGroups) {
    // Giữ lại khách có nhiều đơn hàng nhất (tín hiệu đáng tin nhất là khách
    // "gốc"); hoà thì giữ khách tạo trước.
    const sorted = [...group].sort((a, b) => {
      const countDiff = (orderCountById.get(b.id) || 0) - (orderCountById.get(a.id) || 0);
      if (countDiff !== 0) return countDiff;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    const [keeper, ...losers] = sorted;

    for (const loser of losers) {
      const { data: movedOrders, error: updErr } = await db
        .from("orders")
        .update({ customer_id: keeper.id })
        .eq("customer_id", loser.id)
        .select("id");
      if (updErr) {
        console.error(`❌ SĐT ${phone}: không repoint được đơn của ${loser.id} — ${updErr.message}`);
        continue;
      }
      ordersRepointed += movedOrders?.length ?? 0;

      // legacy_orders.customer_id có on delete set null — không cần repoint,
      // xoá khách sẽ tự null hoá field đó.
      const { error: delErr } = await db.from("customers").delete().eq("id", loser.id);
      if (delErr) {
        console.error(`❌ SĐT ${phone}: không xoá được khách trùng ${loser.id} — ${delErr.message}`);
        continue;
      }
      merged++;
    }
  }

  console.log("\n=== Tổng kết ===");
  console.log("Đã gộp (xoá) khách trùng:", merged);
  console.log("Đơn hàng đã chuyển sang khách gốc:", ordersRepointed);
}

main().catch((err) => {
  console.error("Script lỗi:", err);
  process.exit(1);
});
