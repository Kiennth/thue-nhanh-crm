import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { TRANSPORT_LINE_CATEGORY_BY_TYPE_ID } from "@/lib/commission";

// Lịch thuê kiểu Booqable (CEO 2026-10-04): dòng = mã hàng (mở ra từng máy
// serial), thanh = đơn thuê trong khung đang xem. Chỉ đọc — sửa đơn vẫn ở
// trang đơn.

export type BarStatus = "reserved" | "out" | "overdue" | "done";

export interface CalendarBar {
  orderId: string;
  orderCode: string;
  customer: string;
  quantity: number;
  start: string; // ISO
  end: string; // ISO
  status: BarStatus;
  // Máy tạm "CHỜ MUA" (AUTO-…) — thiếu hàng thật.
  placeholder?: boolean;
}

export interface CalendarInstanceRow {
  id: string;
  label: string;
  placeholder: boolean;
  bars: CalendarBar[];
}

export interface CalendarRow {
  typeId: string;
  name: string;
  serial: boolean;
  // Serial: số máy của loại này ở kho đang lọc (không tính máy đã thanh lý
  // và máy tạm CHỜ MUA). Hàng số lượng: null.
  total: number | null;
  bars: CalendarBar[];
  instances: CalendarInstanceRow[];
}

export interface TimelineData {
  rows: CalendarRow[];
  // Số mã hàng khớp bộ lọc nhưng bị cắt bớt cho nhẹ trang.
  truncated: number;
}

const ROW_LIMIT = 250;
const PLACEHOLDER_PREFIX = "AUTO-CHOMUA";

// Car delivery/collection không nằm trong TRANSPORT_LINE_CATEGORY_BY_TYPE_ID
// (không tính khoán) — thêm tay để nhận ra cách giao.
const CAR_TRANSPORT: Record<string, "delivery" | "collection"> = {
  "ce4a5f88-8daa-47c2-92fc-196d1fc321db": "delivery",
  "1a53924a-a070-44b0-9441-3f09042af7e7": "collection",
};

export function barStatus(o: {
  delivery_stock_moved_at: string | null;
  completed_at: string | null;
  rental_end_at: string | null;
  return_stock_transferred_at?: string | null;
}): BarStatus {
  // Đã nhập kho hoặc đã chuyển máy sang đơn gia hạn → coi như xong.
  if (o.completed_at || o.return_stock_transferred_at) return "done";
  if (o.delivery_stock_moved_at) {
    return o.rental_end_at && Date.parse(o.rental_end_at) < Date.now() ? "overdue" : "out";
  }
  return "reserved";
}

type OrderRow = {
  id: string;
  order_code: string;
  rental_start_at: string;
  rental_end_at: string;
  pickup_branch_id: string;
  return_branch_id: string;
  delivery_stock_moved_at: string | null;
  completed_at: string | null;
  return_stock_transferred_at: string | null;
  customers: { name: string; phone: string | null } | null;
};

const ORDER_COLUMNS =
  "id, order_code, rental_start_at, rental_end_at, pickup_branch_id, return_branch_id, delivery_stock_moved_at, completed_at, return_stock_transferred_at, customers(name, phone)";

type AnyClient = SupabaseClient;

// Đơn (không huỷ) có khung thuê chồng [from, to) — kho lọc theo kho giao/thu hồi.
export async function loadOrdersInRange(
  from: string,
  to: string,
  branchId: string | null,
  client?: AnyClient,
): Promise<OrderRow[]> {
  const supabase = client ?? ((await createClient()) as unknown as AnyClient);
  return fetchAllRows<OrderRow>((a, b) => {
    let q = supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .is("cancelled_at", null)
      .not("rental_start_at", "is", null)
      .not("rental_end_at", "is", null)
      .lt("rental_start_at", to)
      .gt("rental_end_at", from);
    if (branchId) q = q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
    return q.order("id").range(a, b) as unknown as PromiseLike<{ data: OrderRow[] | null }>;
  });
}

type LineRow = {
  order_id: string;
  equipment_type_id: string | null;
  equipment_instance_id: string | null;
  custom_name: string | null;
  quantity: number;
  note: string | null;
  equipment_types: { name: string; product_type: string } | null;
};

async function loadLines(supabase: AnyClient, orderIds: string[]): Promise<LineRow[]> {
  if (!orderIds.length) return [];
  const chunks = await Promise.all(
    chunk(orderIds, 150).map((ids) =>
      fetchAllRows<LineRow>(
        (a, b) =>
          supabase
            .from("order_equipment")
            .select(
              "order_id, equipment_type_id, equipment_instance_id, custom_name, quantity, note, equipment_types(name, product_type)",
            )
            .in("order_id", ids)
            .order("position")
            .range(a, b) as unknown as PromiseLike<{ data: LineRow[] | null }>,
      ),
    ),
  );
  return chunks.flat();
}

export async function loadTimeline(opts: {
  from: string;
  to: string;
  branchId: string | null;
  query: string;
  showAll: boolean;
}): Promise<TimelineData> {
  const supabase = (await createClient()) as unknown as AnyClient;
  const orders = await loadOrdersInRange(opts.from, opts.to, opts.branchId, supabase);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const lines = (await loadLines(supabase, orders.map((o) => o.id))).filter(
    (l) => l.equipment_type_id && l.equipment_types?.product_type === "rental",
  );

  const words = opts.query.split(/\s+/).filter(Boolean);
  const types = await fetchAllRows<{ id: string; name: string; tracking_type: string | null }>((a, b) => {
    let q = supabase
      .from("equipment_types")
      .select("id, name, tracking_type")
      .eq("product_type", "rental")
      .order("name");
    for (const w of words) q = q.ilike("name", `%${w}%`);
    return q.range(a, b) as unknown as PromiseLike<{
      data: { id: string; name: string; tracking_type: string | null }[] | null;
    }>;
  });

  const bookedTypeIds = new Set(lines.map((l) => l.equipment_type_id!));
  const shownTypes = types
    .filter((t) => t.tracking_type !== "combo")
    .filter((t) => opts.showAll || bookedTypeIds.has(t.id));
  const truncated = Math.max(0, shownTypes.length - ROW_LIMIT);
  const visible = shownTypes.slice(0, ROW_LIMIT);
  const visibleIds = new Set(visible.map((t) => t.id));

  // Máy serial của các loại đang hiện (để mở dòng từng máy + đếm còn trống).
  const serialIds = visible.filter((t) => t.tracking_type === "individual").map((t) => t.id);
  type InstanceRow = { id: string; equipment_type_id: string; identifier_code: string };
  const instances = (
    await Promise.all(
      chunk(serialIds, 100).map((ids) =>
        fetchAllRows<InstanceRow>((a, b) => {
          let q = supabase
            .from("equipment_instances")
            .select("id, equipment_type_id, identifier_code")
            .in("equipment_type_id", ids)
            .neq("status", "disposed");
          if (opts.branchId) q = q.eq("branch_id", opts.branchId);
          return q.order("identifier_code").range(a, b) as unknown as PromiseLike<{
            data: InstanceRow[] | null;
          }>;
        }),
      ),
    )
  ).flat();

  const toBar = (o: OrderRow, quantity: number, placeholder = false): CalendarBar => ({
    orderId: o.id,
    orderCode: o.order_code,
    customer: o.customers?.name ?? "—",
    quantity,
    start: o.rental_start_at,
    end: o.rental_end_at,
    status: barStatus(o),
    ...(placeholder ? { placeholder } : {}),
  });

  // Gộp theo (loại, đơn) cho dòng loại; theo máy cho dòng máy.
  const qtyByTypeOrder = new Map<string, Map<string, number>>();
  const ordersByInstance = new Map<string, Set<string>>();
  for (const l of lines) {
    const typeId = l.equipment_type_id!;
    if (!visibleIds.has(typeId)) continue;
    const perOrder = qtyByTypeOrder.get(typeId) ?? new Map<string, number>();
    perOrder.set(l.order_id, (perOrder.get(l.order_id) ?? 0) + l.quantity);
    qtyByTypeOrder.set(typeId, perOrder);
    if (l.equipment_instance_id) {
      const set = ordersByInstance.get(l.equipment_instance_id) ?? new Set();
      set.add(l.order_id);
      ordersByInstance.set(l.equipment_instance_id, set);
    }
  }
  const placeholderInstance = new Set(
    instances.filter((i) => i.identifier_code.startsWith(PLACEHOLDER_PREFIX)).map((i) => i.id),
  );
  const placeholderOrders = new Set<string>();
  for (const [iid, set] of ordersByInstance) {
    if (placeholderInstance.has(iid)) for (const oid of set) placeholderOrders.add(oid);
  }
  const instancesByType = new Map<string, InstanceRow[]>();
  for (const i of instances) {
    const list = instancesByType.get(i.equipment_type_id) ?? [];
    list.push(i);
    instancesByType.set(i.equipment_type_id, list);
  }

  const rows: CalendarRow[] = visible.map((t) => {
    const serial = t.tracking_type === "individual";
    const bars: CalendarBar[] = [];
    for (const [orderId, qty] of qtyByTypeOrder.get(t.id) ?? []) {
      const o = orderById.get(orderId);
      if (o) bars.push(toBar(o, qty, placeholderOrders.has(orderId)));
    }
    bars.sort((a, b) => a.start.localeCompare(b.start));
    const typeInstances = serial ? (instancesByType.get(t.id) ?? []) : [];
    return {
      typeId: t.id,
      name: t.name,
      serial,
      total: serial ? typeInstances.filter((i) => !placeholderInstance.has(i.id)).length : null,
      bars,
      instances: typeInstances.map((i) => ({
        id: i.id,
        label: i.identifier_code,
        placeholder: placeholderInstance.has(i.id),
        bars: [...(ordersByInstance.get(i.id) ?? [])]
          .map((oid) => orderById.get(oid))
          .filter((o): o is OrderRow => !!o)
          .map((o) => toBar(o, 1, placeholderInstance.has(i.id)))
          .sort((a, b) => a.start.localeCompare(b.start)),
      })),
    };
  });

  return { rows, truncated };
}

// ---- Lịch giao / thu hồi theo ngày ----

export type AgendaKind = "delivery" | "return";

export interface AgendaItem {
  orderId: string;
  orderCode: string;
  customer: string;
  phone: string | null;
  at: string; // ISO
  kind: AgendaKind;
  done: boolean;
  // Cách giao/thu: xe máy, ô tô, hay không có dòng vận chuyển (khách tự đến).
  transport: "bike" | "car" | "self";
  // Ghi chú địa chỉ + SĐT trên dòng vận chuyển.
  address: string | null;
  branchId: string;
  items: string[];
}

// Đơn có giờ giao hoặc giờ thu hồi rơi vào [from, to). Dùng chung cho trang
// Lịch và link iCal (client admin, vì Google/Apple tải link không đăng nhập).
export async function loadAgenda(
  from: string,
  to: string,
  branchId: string | null,
  client?: AnyClient,
): Promise<AgendaItem[]> {
  const supabase = client ?? ((await createClient()) as unknown as AnyClient);
  const fetchBy = (column: "rental_start_at" | "rental_end_at") =>
    fetchAllRows<OrderRow>((a, b) => {
      let q = supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .is("cancelled_at", null)
        .gte(column, from)
        .lt(column, to);
      if (branchId) {
        q = q.eq(column === "rental_start_at" ? "pickup_branch_id" : "return_branch_id", branchId);
      }
      return q.order("id").range(a, b) as unknown as PromiseLike<{ data: OrderRow[] | null }>;
    });
  const [starting, ending] = await Promise.all([fetchBy("rental_start_at"), fetchBy("rental_end_at")]);
  const orderIds = [...new Set([...starting, ...ending].map((o) => o.id))];
  const [lines, returnTasks] = await Promise.all([
    loadLines(supabase, orderIds),
    orderIds.length
      ? Promise.all(
          chunk(orderIds, 150).map((ids) =>
            supabase
              .from("order_tasks")
              .select("order_id")
              .in("order_id", ids)
              .eq("task_type", "thu_hoi")
              .not("completed_date", "is", null),
          ),
        ).then((rs) => new Set(rs.flatMap((r) => (r.data ?? []).map((t) => t.order_id as string))))
      : Promise.resolve(new Set<string>()),
  ]);

  const linesByOrder = new Map<string, LineRow[]>();
  for (const l of lines) {
    const list = linesByOrder.get(l.order_id) ?? [];
    list.push(l);
    linesByOrder.set(l.order_id, list);
  }

  const build = (o: OrderRow, kind: AgendaKind): AgendaItem => {
    const orderLines = linesByOrder.get(o.id) ?? [];
    const wanted = kind === "delivery" ? "delivery" : "collection";
    let transport: AgendaItem["transport"] = "self";
    let address: string | null = null;
    for (const l of orderLines) {
      const id = l.equipment_type_id ?? "";
      if (TRANSPORT_LINE_CATEGORY_BY_TYPE_ID[id] === wanted) transport = "bike";
      else if (CAR_TRANSPORT[id] === wanted) transport = "car";
      else continue;
      address = l.note?.trim() || address;
    }
    const items = orderLines
      .filter((l) => l.equipment_types?.product_type !== "service" && !CAR_TRANSPORT[l.equipment_type_id ?? ""])
      .filter((l) => !TRANSPORT_LINE_CATEGORY_BY_TYPE_ID[l.equipment_type_id ?? ""])
      .reduce((acc, l) => {
        const name = l.equipment_types?.name ?? l.custom_name ?? "?";
        acc.set(name, (acc.get(name) ?? 0) + l.quantity);
        return acc;
      }, new Map<string, number>());
    return {
      orderId: o.id,
      orderCode: o.order_code,
      customer: o.customers?.name ?? "—",
      phone: o.customers?.phone ?? null,
      at: kind === "delivery" ? o.rental_start_at : o.rental_end_at,
      kind,
      done:
        kind === "delivery"
          ? Boolean(o.delivery_stock_moved_at || o.completed_at)
          : Boolean(o.completed_at || o.return_stock_transferred_at || returnTasks.has(o.id)),
      transport,
      address,
      branchId: kind === "delivery" ? o.pickup_branch_id : o.return_branch_id,
      items: [...items].map(([name, qty]) => (qty > 1 ? `${qty}× ${name}` : name)),
    };
  };

  return [...starting.map((o) => build(o, "delivery")), ...ending.map((o) => build(o, "return"))].sort(
    (a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind),
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
