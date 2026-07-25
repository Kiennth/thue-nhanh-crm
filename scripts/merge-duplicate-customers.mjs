// Gộp khách hàng trùng tên (do lỗi giới hạn 1000 dòng trong lần import lịch
// sử trước đây tạo ra nhiều bản ghi trùng cho cùng 1 khách). Với mỗi nhóm
// trùng tên: giữ lại bản ghi có nhiều đơn nhất, chuyển orders.customer_id
// của các bản còn lại sang bản được giữ, rồi xoá các bản dư.
//
// Mặc định chạy DRY RUN (chỉ in ra kế hoạch, không đổi gì). Thêm --execute để
// chạy thật.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EXECUTE = process.argv.includes("--execute");
const CHUNK = 1000;

async function fetchAll(table, columns) {
  const all = [];
  let from = 0;
  while (true) {
    const { data } = await db.from(table).select(columns).range(from, from + CHUNK - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

function normName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const currency = (n) => n.toLocaleString("vi-VN") + "đ";

const customers = await fetchAll("customers", "id, name, phone, created_at");
const orders = await fetchAll("orders", "id, customer_id, total_value, cancelled_at");

const orderCountByCustomer = new Map();
const revenueByCustomer = new Map();
for (const o of orders) {
  if (o.cancelled_at) continue;
  orderCountByCustomer.set(o.customer_id, (orderCountByCustomer.get(o.customer_id) ?? 0) + 1);
  revenueByCustomer.set(o.customer_id, (revenueByCustomer.get(o.customer_id) ?? 0) + o.total_value);
}

const byName = new Map();
for (const c of customers) {
  const n = normName(c.name);
  if (!n || n === "khách lẻ") continue;
  const list = byName.get(n) ?? [];
  list.push(c);
  byName.set(n, list);
}

const dupGroups = [...byName.values()].filter((g) => g.length > 1);

// Chọn bản giữ lại: nhiều đơn nhất → doanh thu cao nhất → tạo sớm nhất.
function pickPrimary(group) {
  return [...group].sort((a, b) => {
    const ordersA = orderCountByCustomer.get(a.id) ?? 0;
    const ordersB = orderCountByCustomer.get(b.id) ?? 0;
    if (ordersB !== ordersA) return ordersB - ordersA;
    const revA = revenueByCustomer.get(a.id) ?? 0;
    const revB = revenueByCustomer.get(b.id) ?? 0;
    if (revB !== revA) return revB - revA;
    return a.created_at < b.created_at ? -1 : 1;
  })[0];
}

console.log(`${EXECUTE ? "THỰC THI" : "DRY RUN"} — ${dupGroups.length} nhóm trùng tên\n`);

let totalOrdersRepointed = 0;
let totalCustomersDeleted = 0;

for (const [i, group] of dupGroups.entries()) {
  const primary = pickPrimary(group);
  const losers = group.filter((c) => c.id !== primary.id);
  const loserIds = losers.map((c) => c.id);
  const ordersToRepoint = losers.reduce((sum, c) => sum + (orderCountByCustomer.get(c.id) ?? 0), 0);

  if ((i + 1) % 500 === 0 || i === dupGroups.length - 1) {
    console.log(`[${i + 1}/${dupGroups.length}] "${group[0].name}" — giữ ${primary.id.slice(0, 8)}, xoá ${loserIds.length} bản, chuyển ${ordersToRepoint} đơn`);
  }

  totalOrdersRepointed += ordersToRepoint;
  totalCustomersDeleted += loserIds.length;

  if (EXECUTE) {
    if (ordersToRepoint > 0) {
      const { error: updateErr } = await db
        .from("orders")
        .update({ customer_id: primary.id })
        .in("customer_id", loserIds);
      if (updateErr) {
        console.error(`  LỖI chuyển đơn cho nhóm "${group[0].name}":`, updateErr.message);
        continue;
      }
    }
    const { error: delErr } = await db.from("customers").delete().in("id", loserIds);
    if (delErr) {
      console.error(`  LỖI xoá khách hàng nhóm "${group[0].name}":`, delErr.message);
    }
  }
}

console.log("\n" + "=".repeat(80));
console.log(`Nhóm xử lý: ${dupGroups.length}`);
console.log(`Đơn hàng sẽ chuyển customer_id: ${totalOrdersRepointed}`);
console.log(`Khách hàng sẽ xoá: ${totalCustomersDeleted}`);
console.log(`Khách hàng còn lại (dự kiến): ${customers.length - totalCustomersDeleted}`);
if (!EXECUTE) {
  console.log("\n--> Đây là DRY RUN, chưa đổi gì trong DB. Chạy lại với --execute để thực thi thật.");
}
