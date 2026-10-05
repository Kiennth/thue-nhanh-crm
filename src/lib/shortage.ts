import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Cảnh báo thiếu hàng (CEO 2026-10-04): với mỗi mã hàng × kho giao, so số
// máy kho đang có với số máy các đơn cần CÙNG LÚC trong N ngày tới. Đếm tại
// từng thời điểm nhận máy (không gộp theo ngày) để máy trả sáng – giao chiều
// không bị báo thiếu oan. Đơn đã giao mà quá hạn chưa thu hồi vẫn tính là
// đang giữ máy. Máy tạm CHỜ MUA không tính là có hàng.

const HOUR = 3_600_000;
const PLACEHOLDER_PREFIX = "AUTO-CHOMUA";

export interface ShortageOrder {
  id: string;
  code: string;
  start: string;
  quantity: number;
}

export interface ShortageItem {
  typeId: string;
  typeName: string;
  serial: boolean;
  branchId: string;
  branchName: string;
  capacity: number;
  peak: number;
  missing: number;
  firstAt: string; // ISO — lần đầu thiếu
  // Thiếu ngay lúc này = máy đang ở chỗ khách nhiều hơn kho ghi nhận → số
  // liệu lệch (đơn quá hạn chưa đóng, hàng số lượng chưa nhập tồn) chứ
  // không phải "sắp thiếu" cần mua.
  shortNow: boolean;
  orders: ShortageOrder[]; // đơn đang cần máy lúc thiếu nhiều nhất
}

type OrderRow = {
  id: string;
  order_code: string;
  rental_start_at: string;
  rental_end_at: string;
  pickup_branch_id: string;
  delivery_stock_moved_at: string | null;
};

type LineRow = {
  order_id: string;
  equipment_type_id: string;
  quantity: number;
  equipment_types: { name: string; product_type: string; tracking_type: string | null } | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function loadShortages(
  days: number,
  branchId: string | null = null,
  client?: SupabaseClient,
): Promise<ShortageItem[]> {
  // client: truyền admin client khi chạy ngoài request (cron nhắc việc).
  const db = client ?? ((await createClient()) as unknown as SupabaseClient);
  const now = Date.now();
  const horizon = now + days * 24 * HOUR;
  // Bỏ phần mili-giây: giá trị nằm trong or() của PostgREST, tránh dấu "." thừa.
  const nowIso = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");

  const orders = await fetchAllRows<OrderRow>((a, b) => {
    let q = db
      .from("orders")
      .select("id, order_code, rental_start_at, rental_end_at, pickup_branch_id, delivery_stock_moved_at")
      .is("cancelled_at", null)
      .is("completed_at", null)
      // Máy đã về kho hoặc đã chuyển sang đơn gia hạn → đơn này không giữ máy.
      .is("return_stock_transferred_at", null)
      .not("rental_start_at", "is", null)
      .not("rental_end_at", "is", null)
      .lt("rental_start_at", new Date(horizon).toISOString())
      .or(`rental_end_at.gt.${nowIso},delivery_stock_moved_at.not.is.null`);
    if (branchId) q = q.eq("pickup_branch_id", branchId);
    return q.order("id").range(a, b) as unknown as PromiseLike<{ data: OrderRow[] | null }>;
  });
  if (!orders.length) return [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const lines = (
    await Promise.all(
      chunk(
        orders.map((o) => o.id),
        150,
      ).map((ids) =>
        fetchAllRows<LineRow>(
          (a, b) =>
            db
              .from("order_equipment")
              .select("order_id, equipment_type_id, quantity, equipment_types(name, product_type, tracking_type)")
              .in("order_id", ids)
              .not("equipment_type_id", "is", null)
              .range(a, b) as unknown as PromiseLike<{ data: LineRow[] | null }>,
        ),
      ),
    )
  )
    .flat()
    .filter((l) => l.equipment_types?.product_type === "rental" && l.equipment_types.tracking_type !== "combo");
  if (!lines.length) return [];

  // Nhu cầu theo (mã, kho): từng đơn với số lượng + khung giữ máy.
  type Demand = { orderId: string; qty: number; start: number; end: number };
  const demand = new Map<string, Demand[]>();
  const typeInfo = new Map<string, { name: string; serial: boolean }>();
  for (const l of lines) {
    const o = orderById.get(l.order_id)!;
    const key = `${l.equipment_type_id}|${o.pickup_branch_id}`;
    const end = Date.parse(o.rental_end_at);
    const list = demand.get(key) ?? [];
    const existing = list.find((d) => d.orderId === o.id);
    if (existing) existing.qty += l.quantity;
    else
      list.push({
        orderId: o.id,
        qty: l.quantity,
        start: Date.parse(o.rental_start_at),
        // Đã giao mà quá hạn: vẫn giữ máy tới khi thu hồi.
        end: o.delivery_stock_moved_at ? Math.max(end, now + HOUR) : end,
      });
    demand.set(key, list);
    typeInfo.set(l.equipment_type_id, {
      name: l.equipment_types!.name,
      serial: l.equipment_types!.tracking_type === "individual",
    });
  }

  // Sức chứa: serial = máy chưa thanh lý, không bảo trì, không phải máy tạm;
  // số lượng = tồn trong kho + đang cho thuê (bỏ hàng hỏng/downtime).
  const typeIds = [...typeInfo.keys()];
  const capacity = new Map<string, number>();
  const serialIds = typeIds.filter((t) => typeInfo.get(t)!.serial);
  const qtyIds = typeIds.filter((t) => !typeInfo.get(t)!.serial);
  await Promise.all([
    ...chunk(serialIds, 100).map(async (ids) => {
      const rows = await fetchAllRows<{ equipment_type_id: string; branch_id: string | null; identifier_code: string }>(
        (a, b) =>
          db
            .from("equipment_instances")
            .select("equipment_type_id, branch_id, identifier_code")
            .in("equipment_type_id", ids)
            .in("status", ["available", "rented"])
            .range(a, b) as unknown as PromiseLike<{
            data: { equipment_type_id: string; branch_id: string | null; identifier_code: string }[] | null;
          }>,
      );
      for (const r of rows) {
        if (!r.branch_id || r.identifier_code.startsWith(PLACEHOLDER_PREFIX)) continue;
        const key = `${r.equipment_type_id}|${r.branch_id}`;
        capacity.set(key, (capacity.get(key) ?? 0) + 1);
      }
    }),
    ...chunk(qtyIds, 100).map(async (ids) => {
      const { data } = await db
        .from("equipment_stock")
        .select("branch_id, quantity_in_stock, quantity_picked_up, equipment_units!inner(equipment_type_id)")
        .in("equipment_units.equipment_type_id", ids);
      for (const r of (data ?? []) as unknown as {
        branch_id: string;
        quantity_in_stock: number;
        quantity_picked_up: number;
        equipment_units: { equipment_type_id: string };
      }[]) {
        const key = `${r.equipment_units.equipment_type_id}|${r.branch_id}`;
        capacity.set(key, (capacity.get(key) ?? 0) + r.quantity_in_stock + r.quantity_picked_up);
      }
    }),
  ]);

  const { data: branches } = await db.from("branches").select("id, name");
  const branchName = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  const items: ShortageItem[] = [];
  for (const [key, list] of demand) {
    const [typeId, branch] = key.split("|");
    const cap = capacity.get(key) ?? 0;
    // Các thời điểm cần xét: bây giờ + mọi giờ nhận máy trong khung.
    const points = [now, ...list.map((d) => d.start).filter((t) => t > now && t < horizon)];
    let peak = 0;
    let peakAt = now;
    let firstAt: number | null = null;
    for (const t of points.sort((a, b) => a - b)) {
      const busy = list.filter((d) => d.start <= t && d.end > t).reduce((s, d) => s + d.qty, 0);
      if (busy > cap && firstAt === null) firstAt = t;
      if (busy > peak) {
        peak = busy;
        peakAt = t;
      }
    }
    if (firstAt === null) continue;
    const info = typeInfo.get(typeId)!;
    items.push({
      typeId,
      typeName: info.name,
      serial: info.serial,
      branchId: branch,
      branchName: branchName.get(branch) ?? "—",
      capacity: cap,
      peak,
      missing: peak - cap,
      firstAt: new Date(firstAt).toISOString(),
      shortNow: firstAt === now,
      orders: list
        .filter((d) => d.start <= peakAt && d.end > peakAt)
        .sort((a, b) => a.start - b.start)
        .map((d) => ({
          id: d.orderId,
          code: orderById.get(d.orderId)!.order_code,
          start: orderById.get(d.orderId)!.rental_start_at,
          quantity: d.qty,
        })),
    });
  }
  return items.sort((a, b) => a.firstAt.localeCompare(b.firstAt) || b.missing - a.missing);
}

export interface PlaceholderGroup {
  typeId: string;
  typeName: string;
  count: number;
  lines: { orderId: string; orderCode: string; start: string | null; branchName: string; instanceCode: string }[];
}

// Máy tạm "CHỜ MUA" còn nằm trong đơn chưa xong — chính là danh sách cần mua.
export async function loadPlaceholderNeeds(): Promise<PlaceholderGroup[]> {
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: instances } = await db
    .from("equipment_instances")
    .select("id, identifier_code, equipment_type_id, equipment_types(name)")
    .like("identifier_code", `${PLACEHOLDER_PREFIX}%`)
    .neq("status", "disposed");
  const list = (instances ?? []) as unknown as {
    id: string;
    identifier_code: string;
    equipment_type_id: string;
    equipment_types: { name: string } | null;
  }[];
  if (!list.length) return [];
  const { data: lineRows } = await db
    .from("order_equipment")
    .select(
      "equipment_instance_id, orders!inner(id, order_code, rental_start_at, cancelled_at, completed_at, branches:pickup_branch_id(name))",
    )
    .in(
      "equipment_instance_id",
      list.map((i) => i.id),
    )
    .is("orders.cancelled_at", null)
    .is("orders.completed_at", null);
  const byInstance = new Map<
    string,
    { id: string; order_code: string; rental_start_at: string | null; branches: { name: string } | null }
  >();
  for (const l of (lineRows ?? []) as unknown as {
    equipment_instance_id: string;
    orders: { id: string; order_code: string; rental_start_at: string | null; branches: { name: string } | null };
  }[]) {
    byInstance.set(l.equipment_instance_id, l.orders);
  }

  const groups = new Map<string, PlaceholderGroup>();
  for (const inst of list) {
    const order = byInstance.get(inst.id);
    if (!order) continue; // máy tạm không còn nằm trong đơn mở nào
    const g = groups.get(inst.equipment_type_id) ?? {
      typeId: inst.equipment_type_id,
      typeName: inst.equipment_types?.name ?? "?",
      count: 0,
      lines: [],
    };
    g.count += 1;
    g.lines.push({
      orderId: order.id,
      orderCode: order.order_code,
      start: order.rental_start_at,
      branchName: order.branches?.name ?? "—",
      instanceCode: inst.identifier_code,
    });
    groups.set(inst.equipment_type_id, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
