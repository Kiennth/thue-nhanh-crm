import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Check, Clock, Coins, ListChecks, Lock, Package, UserRound, Wallet } from "lucide-react";
import type { TaskType } from "@/types/database";
import { cn } from "@/lib/utils";
import { AccentTitle, accentCard, accentHeader } from "@/components/section-accent";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentEmployee } from "@/lib/dal";
import { deleteOrderEquipmentLine, deleteOrderEquipmentLines } from "@/lib/actions/orders";
import { deleteOrderPayment } from "@/lib/actions/order-payments";
import { deleteOvertimeEntry } from "@/lib/actions/overtime";
import {
  ORDER_PAYMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  TASK_TYPE_LABELS,
  TASK_TYPE_SEQUENCE,
  VAT_RATE,
} from "@/lib/order-labels";
import {
  equipmentDetailLabel,
  equipmentInstanceLabel,
  RENTAL_PERIOD_UNIT_LABELS,
} from "@/lib/equipment-labels";
import {
  computeRentalDurationInUnit,
  findApplicableTier,
  type PricingTierInput,
} from "@/lib/rental-pricing";
import {
  findCommissionRate,
  computeOrderCommissionFund,
  computeOrderPoolValue,
  computePoolExcludedTotal,
  computeTaskCommission,
  findTaskWeight,
  DELIVERY_NOTE_TYPE_IDS,
  TRANSPORT_LINE_CATEGORY_BY_TYPE_ID,
  type PoolExcludedLineInput,
} from "@/lib/commission";
import { OrderDialog } from "../order-dialog";
import { AddOrderLineDialog } from "./add-order-line-dialog";
import { QuickAddProductSearch } from "./quick-add-product-search";
import { OrderLinesSortableTable } from "./order-lines-sortable";
import { OrderTaskRow } from "./order-task-row";
import { OrderDiscountForm } from "./order-discount-form";
import { OrderLinePriceForm } from "./order-line-price-form";
import { OrderLineQuantityForm } from "./order-line-quantity-form";
import { OrderLineEmployeeForm } from "./order-line-employee-form";
import { OrderLineNoteForm } from "./order-line-note-form";
import { RentalPeriodForm } from "./rental-period-form";
import { OrderInfoForm } from "./order-info-form";
import { CancelOrderButton } from "./cancel-order-button";
import { DuplicateOrderButton } from "./duplicate-order-button";
import { ReopenOrderButton } from "./reopen-order-button";
import { OrderPaymentDialog } from "./order-payment-dialog";
import { RfidScanDialog } from "./rfid-scan-dialog";
import { OvertimeDialog } from "./overtime-dialog";
import { PrintMenu } from "./print-menu";
import { OrderConflictAlert } from "./order-conflict-alert";
import { SendDocumentEmailDialog } from "./send-document-email-dialog";
import { OrderComments } from "./order-comments";
import { OrderLineGroupPriceForm } from "./order-line-group-price-form";
import { SerialChipList } from "./serial-chip-list";
import { ComboChildSwapButton, ComboPriceForm } from "./combo-line-controls";
import { OrderLineChargeDurationForm } from "./order-line-charge-duration-form";
import { ORDER_LINES_TABLE_CLASS } from "./order-lines-table-style";
import { countAssemblableSets } from "@/lib/combo";
import { BRANCH_SCOPED_ROLES, MANAGE_ROLES } from "@/lib/roles";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Khâu mở đầu mỗi giai đoạn (bán hàng/vận hành/hoàn tất) trong stepper 10
// khâu — dùng để ngắt đường nối dọc trước nhãn giai đoạn, xem order-labels.ts
// cho thứ tự đầy đủ.
const TASK_PHASE_STARTS = new Set(["chuan_bi", "nghiem_thu"]);

// Server Action gửi chứng từ qua email (render PDF bằng Chromium headless)
// có thể chạy quá 10-15s mặc định của Vercel serverless — nới lên 60s.
export const maxDuration = 60;

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: order },
    { data: lines },
    { data: tasks },
    { data: payments },
    { data: branches },
    { data: employees },
    { data: equipmentTypes },
    { data: equipmentUnits },
    { data: equipmentStock },
    { data: pricingTiers },
    { data: commissionTiers },
    { data: taskWeights },
    { data: overtimeEntries },
    employee,
  ] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_equipment").select("*").eq("order_id", id).order("position"),
    supabase.from("order_tasks").select("*").eq("order_id", id),
    supabase.from("order_payments").select("*").eq("order_id", id).order("paid_at"),
    supabase.from("branches").select("id, name").order("position"),
    supabase.from("employees_public").select("id, name, is_active, branch_id").order("name"),
    supabase
      .from("equipment_types")
      .select(
        "id, name, product_type, tracking_type, pricing_method, price, deposit_amount, payout_percentage, rental_period_unit, pricing_template_id, image_url",
      )
      .order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
    supabase.from("equipment_stock").select("equipment_unit_id, branch_id, quantity_in_stock"),
    supabase
      .from("pricing_template_tiers")
      .select("template_id, min_duration, duration_unit, discount_percentage"),
    supabase.from("commission_tiers").select("*"),
    supabase.from("task_weights").select("*"),
    supabase.from("overtime_entries").select("*").eq("order_id", id).order("entry_date", { ascending: false }),
    getCurrentEmployee(),
  ]);

  if (!order) {
    notFound();
  }

  // equipment_instances đã hơn 1.700 dòng (mỗi máy serialize là 1 dòng) —
  // Supabase/PostgREST chặn CỨNG ở 1.000 dòng/lần gọi kể cả khi request
  // .range() rộng hơn (không lỗi, chỉ âm thầm cắt bớt), nên phải phân trang
  // bằng fetchAllRows để lấy đủ toàn bộ, tránh 1 phần catalog "biến mất"
  // khỏi ô tìm nhanh và tên biến thể của dòng hàng cũ hiện "—".
  const equipmentInstances = await fetchAllRows<{
    id: string;
    equipment_type_id: string;
    equipment_unit_id: string | null;
    identifier_code: string;
    status: string;
    branch_id: string | null;
  }>((from, to) =>
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, equipment_unit_id, identifier_code, status, branch_id")
      .range(from, to),
  );

  // Món con của các combo (CEO 2026-09-26) — để ô thêm nhanh báo số bộ ghép
  // được tại kho giao.
  const [{ data: comboComponents }, { data: comboAlternatives }] = await Promise.all([
    supabase.from("equipment_type_components").select("id, combo_type_id, component_type_id, quantity"),
    supabase.from("equipment_type_component_alternatives").select("component_id, alternative_type_id"),
  ]);

  // Danh sách customers ở trên bị Supabase giới hạn 1.000 dòng (nay có hơn
  // 5.800 khách hàng) nên không đảm bảo chứa đúng khách của đơn này — luôn
  // tra thẳng theo customer_id để tên/tỉ lệ cọc hiển thị đúng bất kể thứ tự.
  const { data: orderCustomer } = await supabase
    .from("customers")
    .select("id, name, email, deposit_percentage")
    .eq("id", order.customer_id)
    .maybeSingle();

  const { data: commentRows } = await supabase
    .from("order_comments")
    .select("id, parent_id, body, created_at, employees(name)")
    .eq("order_id", id)
    .order("created_at");
  const orderComments = (commentRows ?? []).map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    body: c.body,
    createdAt: c.created_at,
    authorName: (c.employees as unknown as { name: string } | null)?.name ?? "Nhân viên",
  }));

  const canManage = !!employee && MANAGE_ROLES.includes(employee.role);
  // Dòng vận chuyển (giao/thu hồi xe máy) — Cửa hàng trưởng/Kỹ thuật-Sale
  // được tự điền (theo yêu cầu CEO), khác các dòng dịch vụ tĩnh khác chỉ
  // canManage mới sửa được.
  const canAssignTransport = canManage || (!!employee && BRANCH_SCOPED_ROLES.includes(employee.role));
  const branchList = branches ?? [];
  const employeeList = employees ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const employeeNameById = new Map(employeeList.map((e) => [e.id, e.name]));
  // Ô chọn người phụ trách chỉ hiện nhân viên ĐANG HOẠT ĐỘNG (CEO 2026-09-25:
  // người đã khoá vẫn lọt vào ô 10 khâu khoán). Người đã khoá nhưng đang được
  // gán sẵn thì vẫn giữ trong ô của chính dòng/khâu đó để tên không biến mất
  // khỏi lịch sử khoán. employeeNameById giữ đủ mọi người để hiển thị tên cũ.
  const activeEmployeeList = employeeList.filter((e) => e.is_active);
  const employeeOptionsFor = (assignedId: string | null | undefined) =>
    assignedId && !activeEmployeeList.some((e) => e.id === assignedId)
      ? [...activeEmployeeList, ...employeeList.filter((e) => e.id === assignedId)]
      : activeEmployeeList;
  // Ô chọn ở 10 khâu (CEO 2026-09-25): người của kho phụ trách khâu đó lên
  // đầu — khâu thu hồi/nghiệm thu/nhập kho thuộc kho THU HỒI, các khâu còn
  // lại thuộc kho GIAO. Mỗi nhóm xếp ABC tiếng Việt.
  const RETURN_SIDE_TASKS: TaskType[] = ["thu_hoi", "nghiem_thu", "nhap_kho_bao_tri"];
  const taskEmployeeOptions = (taskType: TaskType, assignedId: string | null | undefined) => {
    const branchId = RETURN_SIDE_TASKS.includes(taskType)
      ? order.return_branch_id
      : order.pickup_branch_id;
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "vi");
    const options = employeeOptionsFor(assignedId);
    const local = options.filter((e) => e.branch_id === branchId).sort(byName);
    const others = options.filter((e) => e.branch_id !== branchId).sort(byName);
    return {
      employees: [...local, ...others],
      priorityCount: local.length,
      priorityLabel: `Kho ${branchNameById.get(branchId) ?? "phụ trách"}`,
    };
  };
  const equipmentTypeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const equipmentUnitById = new Map((equipmentUnits ?? []).map((u) => [u.id, u]));
  const equipmentInstanceById = new Map((equipmentInstances ?? []).map((i) => [i.id, i]));
  // Số biến thể của từng loại hàng — loại chỉ có 1 biến thể thì cột "Biến
  // thể/Sản phẩm" ẩn tên biến thể (không phân biệt gì thêm, chỉ lặp tên SP).
  const unitCountByType = new Map<string, number>();
  for (const u of equipmentUnits ?? []) {
    unitCountByType.set(u.equipment_type_id, (unitCountByType.get(u.equipment_type_id) ?? 0) + 1);
  }

  const taskByType = new Map((tasks ?? []).map((t) => [t.task_type, t]));
  const doneCount = (tasks ?? []).filter((t) => t.completed_date).length;
  // Bỏ tick khâu đã hoàn thành — CEO chốt 2026-08-06, hẹp hơn canManage (thêm
  // Cửa hàng trưởng, xem uncompleteOrderTask trong actions/orders.ts). Chỉ
  // khâu CUỐI CÙNG đã hoàn thành mới cho bỏ, để giữ đúng tính tuần tự.
  const canUncompleteTask =
    canManage || (!!employee && employee.role === "cua_hang_truong");
  // Tiền khoán (quỹ khoán đơn + % từng khâu) — CEO chốt 2026-09-25 chỉ
  // Giám đốc/Admin/Kế toán/Cửa hàng trưởng xem; Kỹ thuật/Sales không thấy.
  const canSeeCommission =
    canManage || (!!employee && employee.role === "cua_hang_truong");
  let lastDoneTaskType: TaskType | null = null;
  for (let i = TASK_TYPE_SEQUENCE.length - 1; i >= 0; i--) {
    if (taskByType.get(TASK_TYPE_SEQUENCE[i])?.completed_date) {
      lastDoneTaskType = TASK_TYPE_SEQUENCE[i];
      break;
    }
  }

  // Doanh số các dòng dịch vụ trả khoán trực tiếp (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ
  // thuật...) loại khỏi giá trị dùng để tra bậc %hoa hồng/tính quỹ khoán
  // theo khâu — tránh tính khoán 2 lần cho cùng 1 đồng doanh số.
  const poolExcludedTotal = computePoolExcludedTotal(
    (lines ?? []) as PoolExcludedLineInput[],
    new Set([
      ...(equipmentTypes ?? []).filter((t) => t.payout_percentage != null).map((t) => t.id),
      ...Object.keys(TRANSPORT_LINE_CATEGORY_BY_TYPE_ID),
    ]),
  );
  const poolValue = computeOrderPoolValue(order.total_value, poolExcludedTotal);

  // Chỉ dòng CHO THUÊ mới được giảm giá (dịch vụ/bán hàng giữ nguyên), nên
  // đây là mốc để quy đổi "giảm N%" ra số tiền và để chặn giảm quá tay.
  const rentalSubtotal = (lines ?? []).reduce((sum, line) => {
    const type = line.equipment_type_id ? equipmentTypeById.get(line.equipment_type_id) : undefined;
    return type?.product_type === "rental" ? sum + line.line_total : sum;
  }, 0);
  const commissionRate = canSeeCommission
    ? findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, poolValue)
    : 0;
  const commissionFund = canSeeCommission ? computeOrderCommissionFund(poolValue, commissionRate) : 0;

  // Giá trong đơn (total_value) chưa gồm VAT — chỉ cộng thêm để hiển thị số
  // tổng phải thu của khách, không dùng số đã gồm VAT để tính khoán.
  const vatAmount = Math.round(order.total_value * VAT_RATE * 100) / 100;
  const grandTotal = order.total_value + vatAmount;

  // order_payments gồm 3 loại (payment_type) dùng chung 1 bảng: thanh toán
  // hoá đơn thuê/dịch vụ, thu cọc, hoàn cọc — cọc không tính vào "Đã thanh
  // toán" hoá đơn vì nó là khoản giữ hộ (không tính VAT), không phải doanh
  // thu đơn.
  const invoicePaymentList = (payments ?? []).filter((p) => p.payment_type === "invoice");
  const totalPaid = invoicePaymentList.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const paymentStatus =
    totalPaid <= 0 ? "Chưa thanh toán" : remaining <= 0 ? "Đã thanh toán đủ" : "Thanh toán một phần";

  // Tiền cọc = tổng (số lượng x cọc/đơn vị) của các dòng hàng CHO THUÊ trong
  // đơn, nhân với tỉ lệ cọc riêng của khách hàng (mặc định 100%, khách thân
  // thiết có thể được giảm còn 50% hoặc miễn cọc), làm tròn đến triệu cho
  // gọn — không tính VAT, thu cùng lúc với đơn, hoàn lại sau khi nghiệm thu.
  const rawDeposit = (lines ?? []).reduce((sum, line) => {
    const type = line.equipment_type_id ? equipmentTypeById.get(line.equipment_type_id) : undefined;
    // Combo không cọc riêng — cọc nằm ở các món con.
    if (type?.product_type !== "rental" || type.tracking_type === "combo") return sum;
    return sum + (type.deposit_amount ?? 0) * line.quantity;
  }, 0);
  const customerDepositPercentage = orderCustomer?.deposit_percentage ?? 100;
  const totalDeposit =
    // So sánh lỏng (!= thay vì !==): cột này migration mới thêm, có thể
    // chưa lên production nếu đợt deploy chạy trước lúc db push xong — lúc
    // đó Postgres trả undefined (không phải null), phải coi 2 giá trị này
    // như nhau (đều nghĩa là "chưa override, tính như cũ").
    order.deposit_override_amount != null
      ? order.deposit_override_amount
      : Math.round((rawDeposit * customerDepositPercentage) / 100 / 1_000_000) * 1_000_000;

  const depositPaymentList = (payments ?? [])
    .filter((p) => p.payment_type === "deposit_collect" || p.payment_type === "deposit_refund")
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const depositCollected = depositPaymentList
    .filter((p) => p.payment_type === "deposit_collect")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositRefunded = depositPaymentList
    .filter((p) => p.payment_type === "deposit_refund")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositHeld = depositCollected - depositRefunded;
  // Gợi ý số tiền hoàn cọc tự bù trừ chênh lệch hoá đơn phát sinh do đơn bị
  // sửa (đổi số lượng...) sau khi đã thu tiền — khách còn thiếu hoá đơn thì
  // trừ bớt vào cọc hoàn, khách dư hoá đơn (đơn giảm sau khi đã trả theo giá
  // cũ) thì cộng thêm vào cọc hoàn — gộp về 1 lần hoàn cuối thay vì phải xử
  // lý hoá đơn và cọc thành 2 giao dịch riêng.
  const depositRefundSuggestion = Math.max(0, depositHeld - (grandTotal - totalPaid));

  // Cảnh báo thiếu hàng: so số lượng sẵn có tại chi nhánh của đơn với tổng
  // nhu cầu của TẤT CẢ đơn CHƯA hoàn tất đang giữ cùng biến thể đó tại chi
  // nhánh này (không chỉ riêng đơn đang xem) — hệ thống chưa có cơ chế đặt
  // trước/khoá kho theo đơn, đây chỉ là con số tổng hợp để biết mà lên kế
  // hoạch xử lý (mua thêm/điều chuyển), KHÔNG chặn lưu đơn.
  const availableByUnit = new Map(
    (equipmentStock ?? [])
      .filter((s) => s.branch_id === order.pickup_branch_id)
      .map((s) => [s.equipment_unit_id, s.quantity_in_stock]),
  );
  const demandByUnit = new Map<string, number>();
  for (const line of lines ?? []) {
    if (!line.equipment_unit_id) continue;
    demandByUnit.set(
      line.equipment_unit_id,
      (demandByUnit.get(line.equipment_unit_id) ?? 0) + line.quantity,
    );
  }

  const relevantUnitIds = [...demandByUnit.keys()];
  let reservationLines: { order_id: string; equipment_unit_id: string | null; quantity: number }[] =
    [];
  let reservationOrders: {
    id: string;
    order_code: string;
    pickup_branch_id: string;
    completed_at: string | null;
    cancelled_at: string | null;
    rental_start_at: string | null;
    rental_end_at: string | null;
    delivery_stock_moved_at: string | null;
  }[] = [];
  if (relevantUnitIds.length > 0) {
    const { data: oeRows } = await supabase
      .from("order_equipment")
      .select("order_id, equipment_unit_id, quantity")
      .in("equipment_unit_id", relevantUnitIds);
    reservationLines = oeRows ?? [];

    const orderIds = [...new Set(reservationLines.map((r) => r.order_id))];
    const { data: ordersRows } = await supabase
      .from("orders")
      .select(
        "id, order_code, pickup_branch_id, completed_at, cancelled_at, rental_start_at, rental_end_at, delivery_stock_moved_at",
      )
      .in("id", orderIds);
    reservationOrders = ordersRows ?? [];
  }
  const reservationOrderById = new Map(reservationOrders.map((o) => [o.id, o]));

  // Hai khung thời gian thuê giao nhau (mở, không tính đơn nối đuôi sát giờ).
  function rentalOverlaps(
    aStart: string | null,
    aEnd: string | null,
    bStart: string | null,
    bEnd: string | null,
  ) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
  }

  // Nhu cầu đang mở (chưa hoàn tất/chưa huỷ) theo từng biến thể, tại đúng chi
  // nhánh của đơn — gồm cả đơn đang xem. Đơn ĐÃ giao hàng
  // (delivery_stock_moved_at) không tính nữa: hàng của nó đã bị trừ vật lý
  // khỏi "trong kho" rồi, tính thêm là đếm đôi. Với hàng cho thuê
  // (product_type = rental), chỉ tính là "giữ chỗ" nếu khung thời gian thuê
  // của đơn kia giao với khung thời gian của đơn đang xem — hàng cho thuê ở
  // hai khung giờ khác nhau không thật sự tranh chấp kho. Hàng bán/dịch vụ
  // vẫn tính gộp không phân biệt thời gian vì tiêu hao kho vĩnh viễn.
  const activeDemandByUnit = new Map<string, { orderId: string; orderCode: string; quantity: number }[]>();
  for (const row of reservationLines) {
    if (!row.equipment_unit_id) continue;
    const ord = reservationOrderById.get(row.order_id);
    if (
      !ord ||
      ord.pickup_branch_id !== order.pickup_branch_id ||
      ord.completed_at ||
      ord.cancelled_at ||
      ord.delivery_stock_moved_at
    )
      continue;

    const unit = equipmentUnitById.get(row.equipment_unit_id);
    const type = unit ? equipmentTypeById.get(unit.equipment_type_id) : undefined;
    if (type?.product_type === "rental" && ord.id !== order.id) {
      const overlaps = rentalOverlaps(
        order.rental_start_at,
        order.rental_end_at,
        ord.rental_start_at,
        ord.rental_end_at,
      );
      if (!overlaps) continue;
    }

    const list = activeDemandByUnit.get(row.equipment_unit_id) ?? [];
    list.push({ orderId: row.order_id, orderCode: ord.order_code, quantity: row.quantity });
    activeDemandByUnit.set(row.equipment_unit_id, list);
  }

  // Bảng giá mẫu theo template — nuôi dòng diễn giải "charge" dưới giá thuê
  // (giá gốc × số kỳ · bậc giảm), kiểu cột Charge của Booqable.
  const tiersByTemplate = new Map<string, PricingTierInput[]>();
  for (const t of pricingTiers ?? []) {
    const list = tiersByTemplate.get(t.template_id) ?? [];
    list.push(t);
    tiersByTemplate.set(t.template_id, list);
  }

  // Diễn giải giá thuê mặc định của 1 dòng hàng: số kỳ tính từ khung thời gian
  // thuê của ĐƠN + bậc giảm đang áp — trả null với dòng không phải cho thuê
  // hoặc đơn chưa có khung thời gian (khi đó chỉ hiện số tiền như cũ).
  const orderRentalStartAt = order.rental_start_at;
  const orderRentalEndAt = order.rental_end_at;
  // durationOverride = số kỳ tính tiền sửa tay trên dòng (charge_duration,
  // CEO 2026-09-26) — có thì diễn giải theo số đó thay vì theo thời gian thuê.
  function describeCharge(
    type: (NonNullable<typeof equipmentTypes>)[number],
    unitPrice: number,
    durationOverride?: number | null,
  ) {
    if (type.product_type !== "rental" || !type.rental_period_unit) return null;
    const autoDuration =
      orderRentalStartAt && orderRentalEndAt
        ? computeRentalDurationInUnit(orderRentalStartAt, orderRentalEndAt, type.rental_period_unit)
        : null;
    const duration = durationOverride ?? autoDuration;
    if (duration == null) return null;
    const tier =
      type.pricing_method === "pricing_structure" && type.pricing_template_id
        ? findApplicableTier(
            tiersByTemplate.get(type.pricing_template_id) ?? [],
            type.rental_period_unit,
            duration,
          )
        : null;
    const defaultUnitPrice =
      Math.round(type.price * duration * (1 - (tier?.discount_percentage ?? 0) / 100) * 100) / 100;
    return {
      duration,
      unitLabel: RENTAL_PERIOD_UNIT_LABELS[type.rental_period_unit],
      basePrice: type.price,
      tier,
      // Giá lưu trên dòng lệch giá tính mặc định → đã được sửa tay.
      isCustom: Math.abs(defaultUnitPrice - unitPrice) > 0.5,
      defaultUnitPrice,
      autoDuration,
      isDurationCustom: durationOverride != null,
    };
  }

  const stockShortages = [...demandByUnit.entries()]
    .map(([unitId, thisOrderDemand]) => {
      const unit = equipmentUnitById.get(unitId);
      const type = unit ? equipmentTypeById.get(unit.equipment_type_id) : undefined;
      const available = availableByUnit.get(unitId) ?? 0;
      const entries = activeDemandByUnit.get(unitId) ?? [];
      const totalDemand = entries.reduce((sum, e) => sum + e.quantity, 0);
      const otherOrderTotals = new Map<string, number>();
      for (const e of entries) {
        if (e.orderId === order.id) continue;
        otherOrderTotals.set(e.orderCode, (otherOrderTotals.get(e.orderCode) ?? 0) + e.quantity);
      }
      return {
        unitId,
        label: `${type?.name ?? "—"} (${unit?.brand_model ?? "—"})`,
        thisOrderDemand,
        totalDemand,
        available,
        shortage: totalDemand - available,
        otherOrders: [...otherOrderTotals.entries()],
      };
    })
    .filter((s) => s.shortage > 0);
  const shortageByUnit = new Map(stockShortages.map((s) => [s.unitId, s]));

  // Chip xanh "còn N" (học Booqable "N left"): số còn dư tại chi nhánh sau
  // khi trừ MỌI nhu cầu đang mở — chỉ tính cho biến thể không bị thiếu.
  const stockLeftByUnit = new Map<string, number>();
  for (const [unitId] of demandByUnit) {
    if (shortageByUnit.has(unitId)) continue;
    const totalDemand = (activeDemandByUnit.get(unitId) ?? []).reduce(
      (sum, e) => sum + e.quantity,
      0,
    );
    stockLeftByUnit.set(unitId, (availableByUnit.get(unitId) ?? 0) - totalDemand);
  }

  // Danh sách thêm nhanh (ô search kiểu Booqable) — trải phẳng: loại nhiều
  // biến thể → 1 dòng/biến thể; theo dõi riêng lẻ → 1 dòng/máy sẵn có; còn
  // lại 1 dòng/loại (server tự chọn/tạo biến thể mặc định).
  const unitsByType = new Map<string, { id: string; brand_model: string }[]>();
  for (const u of equipmentUnits ?? []) {
    const list = unitsByType.get(u.equipment_type_id) ?? [];
    list.push(u);
    unitsByType.set(u.equipment_type_id, list);
  }
  // Số bộ combo ghép được tại kho giao = món con ít nhất (máy serial sẵn có /
  // tồn kho theo số lượng) — chỉ để tham khảo, lúc thêm vẫn kiểm lại thật.
  const componentsByCombo = new Map<
    string,
    { id: string; component_type_id: string; quantity: number }[]
  >();
  for (const c of comboComponents ?? []) {
    componentsByCombo.set(c.combo_type_id, [...(componentsByCombo.get(c.combo_type_id) ?? []), c]);
  }
  const unitsByTypeForStock = new Map<string, string[]>();
  for (const u of equipmentUnits ?? []) {
    unitsByTypeForStock.set(u.equipment_type_id, [
      ...(unitsByTypeForStock.get(u.equipment_type_id) ?? []),
      u.id,
    ]);
  }
  const availableAtPickup = (typeId: string) => {
    const type = equipmentTypeById.get(typeId);
    if (type?.tracking_type === "individual") {
      return (equipmentInstances ?? []).filter(
        (i) =>
          i.equipment_type_id === typeId &&
          i.status === "available" &&
          i.branch_id === order.pickup_branch_id,
      ).length;
    }
    return (unitsByTypeForStock.get(typeId) ?? []).reduce(
      (sum, unitId) => sum + (availableByUnit.get(unitId) ?? 0),
      0,
    );
  };
  const quickAddOptions = (equipmentTypes ?? []).flatMap((t) => {
    if (t.tracking_type === "combo") {
      const components = componentsByCombo.get(t.id) ?? [];
      // Món có máy thay thế: sẵn có = cộng dồn món chính + các máy thay thế.
      const sets = countAssemblableSets(
        components.map((c) => ({
          quantity: c.quantity,
          available: [
            c.component_type_id,
            ...(comboAlternatives ?? [])
              .filter((a) => a.component_id === c.id)
              .map((a) => a.alternative_type_id),
          ].reduce((sum, typeId) => sum + availableAtPickup(typeId), 0),
        })),
      );
      return [
        {
          key: `c-${t.id}`,
          label: components.length
            ? `${t.name} — Combo ${components.length} món (ghép được ${sets} bộ tại kho)`
            : `${t.name} — Combo (chưa khai báo món con)`,
          imageUrl: t.image_url,
          equipmentTypeId: t.id,
        },
      ];
    }
    if (t.product_type === "rental" && t.tracking_type === "individual") {
      return (equipmentInstances ?? [])
        .filter((i) => i.equipment_type_id === t.id && i.status === "available")
        .map((i) => {
          // Đa số máy chưa gán biến thể (equipment_unit_id null) — lúc đó
          // nhãn giữ nguyên như trước, chỉ tên loại + serial.
          const unitName = i.equipment_unit_id
            ? equipmentUnitById.get(i.equipment_unit_id)?.brand_model
            : null;
          return {
            key: `i-${i.id}`,
            label: `${t.name} — ${equipmentInstanceLabel(unitName, i.identifier_code)}`,
            imageUrl: t.image_url,
            equipmentTypeId: t.id,
            equipmentInstanceId: i.id,
          };
        });
    }
    const units = unitsByType.get(t.id) ?? [];
    if (units.length > 1) {
      return units.map((u) => ({
        key: `u-${u.id}`,
        label: `${t.name} — ${u.brand_model}`,
        imageUrl: t.image_url,
        equipmentTypeId: t.id,
        equipmentUnitId: u.id,
      }));
    }
    return [{ key: `t-${t.id}`, label: t.name, imageUrl: t.image_url, equipmentTypeId: t.id }];
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{order.order_code}</h1>
          {order.cancelled_at ? (
            <Badge variant="destructive">Đã huỷ</Badge>
          ) : order.completed_at ? (
            <Badge>Hoàn tất</Badge>
          ) : (
            <Badge variant="outline">{TASK_TYPE_LABELS[order.status]}</Badge>
          )}
        </div>
        {/* flex-wrap: mobile 375px không đủ chỗ 5 nút hành động 1 hàng —
            không wrap là cả trang bị scroll ngang. */}
        <div className="flex flex-wrap items-center gap-2">
          <PrintMenu orderId={order.id} />
          <SendDocumentEmailDialog orderId={order.id} customerEmail={orderCustomer?.email ?? null} />
          <OrderDialog
            branches={branchList}
            order={{ ...order, customer_name: orderCustomer?.name ?? "" }}
          />
          <DuplicateOrderButton orderId={order.id} />
          {/* Không còn nút "Hoàn tất đơn" — đơn tự hoàn tất khi đủ 10 khâu
              (trigger auto_complete_order). */}
          {!order.completed_at && !order.cancelled_at && (
            <CancelOrderButton orderId={order.id} />
          )}
          {order.completed_at && canManage && <ReopenOrderButton orderId={order.id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className={accentCard("indigo")}>
          <CardHeader className={accentHeader("indigo")}>
            <CardTitle className="text-base">
              <AccentTitle accent="indigo" icon={UserRound}>Thông tin đơn</AccentTitle>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Chi nhánh</p>
              <p className="font-medium">{branchNameById.get(order.pickup_branch_id) ?? "—"}</p>
              {order.return_branch_id !== order.pickup_branch_id && (
                <p className="text-xs text-muted-foreground">
                  Thu hồi tại: {branchNameById.get(order.return_branch_id) ?? "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ngày</p>
              <p className="font-medium">{order.order_date}</p>
            </div>
            <OrderInfoForm
              orderId={order.id}
              customer={orderCustomer ? { id: orderCustomer.id, name: orderCustomer.name } : null}
              ordererName={order.orderer_name}
              ordererPhone={order.orderer_phone}
              ordererEmail={order.orderer_email}
            />
          </CardContent>
        </Card>

        <Card className={accentCard("sky")}>
          <CardHeader className={accentHeader("sky")}>
            <CardTitle className="text-base">
              <AccentTitle accent="sky" icon={CalendarClock}>Thời gian thuê</AccentTitle>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RentalPeriodForm
              key={`${order.rental_start_at ?? ""}-${order.rental_end_at ?? ""}`}
              orderId={order.id}
              rentalStartAt={order.rental_start_at}
              rentalEndAt={order.rental_end_at}
            />
          </CardContent>
        </Card>
      </div>

      {/* Cảnh báo trùng lịch — đặt ngay trên danh sách thiết bị, tự tính lại
          sau mỗi lần thêm dòng/đổi khoảng thuê (trang revalidate). */}
      <OrderConflictAlert orderId={order.id} />

      <Card className={accentCard("blue")}>
        <CardHeader className={accentHeader("blue", "flex-row items-center justify-between")}>
          <CardTitle className="text-base">
            <AccentTitle accent="blue" icon={Package}>Danh sách thiết bị</AccentTitle>
          </CardTitle>
              <AddOrderLineDialog
                orderId={order.id}
                equipmentTypes={equipmentTypes ?? []}
                equipmentUnits={equipmentUnits ?? []}
                // Dialog chỉ cho chọn máy sẵn có — lọc trước khi truyền,
                // đỡ serialize cả nghìn máy đang thuê/bảo trì vào payload
                // (bảng hiển thị vẫn dùng danh sách đầy đủ ở trên).
                equipmentInstances={(equipmentInstances ?? []).filter(
                  (i) => i.status === "available",
                )}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {!order.completed_at && !order.cancelled_at && (
                <QuickAddProductSearch orderId={order.id} options={quickAddOptions} />
              )}
              <div className="overflow-x-auto rounded-lg border">
                {lines?.length ? (
                  (() => {
                    // Cột "Số kỳ tính" — số ngày/giờ... tính tiền của dòng, sửa
                    // tay được (khách cầm 5 ngày, tính 3 ngày).
                    const durationCell = (
                      type: (NonNullable<typeof equipmentTypes>)[number] | undefined,
                      lineIds: string[],
                      unitPrice: number,
                      durationOverride: number | null,
                    ) => {
                      const c = type ? describeCharge(type, unitPrice, durationOverride) : null;
                      return (
                        <TableCell>
                          {c ? (
                            <OrderLineChargeDurationForm
                              lineIds={lineIds}
                              duration={c.duration}
                              autoDuration={c.autoDuration}
                              isCustom={c.isDurationCustom}
                              unitLabel={c.unitLabel}
                              canEdit={canManage}
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      );
                    };
                    const renderSingleLine = (line: (typeof lines)[number]) => {
                        const type = line.equipment_type_id
                          ? equipmentTypeById.get(line.equipment_type_id)
                          : undefined;
                        const isTransportLine =
                          !!line.equipment_type_id &&
                          line.equipment_type_id in TRANSPORT_LINE_CATEGORY_BY_TYPE_ID;
                        // 4 SKU giao/thu hồi (xe máy + ô tô) — ô ghi chú địa
                        // chỉ + SĐT nhận/trả hàng, độc lập với việc gán nhân
                        // viên/tính khoán ở trên.
                        const showDeliveryNote =
                          !!line.equipment_type_id && DELIVERY_NOTE_TYPE_IDS.has(line.equipment_type_id);
                        const lineInstance = line.equipment_instance_id
                          ? equipmentInstanceById.get(line.equipment_instance_id)
                          : undefined;
                        const rawDetail = line.equipment_unit_id
                          ? equipmentUnitById.get(line.equipment_unit_id)?.brand_model
                          : lineInstance
                            ? equipmentInstanceLabel(
                                lineInstance.equipment_unit_id
                                  ? equipmentUnitById.get(lineInstance.equipment_unit_id)?.brand_model
                                  : null,
                                lineInstance.identifier_code,
                              )
                            : null;
                        const detail = equipmentDetailLabel(type?.name, rawDetail, {
                          soleVariant:
                            !!line.equipment_unit_id &&
                            !!type &&
                            unitCountByType.get(type.id) === 1,
                        });
                        const shortage = line.equipment_unit_id
                          ? shortageByUnit.get(line.equipment_unit_id)
                          : undefined;
                        const charge = type ? describeCharge(type, line.unit_price, line.charge_duration) : null;
                        return {
                          id: line.id,
                          content: (
                            <>
                              <TableCell
                                className="font-medium"
                                title={type?.name ?? line.custom_name ?? undefined}
                              >
                                <div className="flex items-center gap-2">
                                  {type?.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- ảnh Supabase storage, cùng convention trang thiết bị
                                    <img
                                      src={type.image_url}
                                      alt=""
                                      className="size-8 shrink-0 rounded object-cover"
                                    />
                                  ) : (
                                    <span className="bg-muted size-8 shrink-0 rounded" />
                                  )}
                                  <span className="truncate">
                                    {type ? (
                                      <Link
                                        href={`/equipment/${type.id}`}
                                        className="underline-offset-2 hover:underline"
                                      >
                                        {type.name}
                                      </Link>
                                    ) : (
                                      (line.custom_name ?? "—")
                                    )}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="truncate" title={detail}>
                                {detail}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {canManage && !line.equipment_instance_id ? (
                                    <OrderLineQuantityForm lineId={line.id} quantity={line.quantity} />
                                  ) : (
                                    line.quantity
                                  )}
                                  {!shortage &&
                                    line.equipment_unit_id &&
                                    stockLeftByUnit.has(line.equipment_unit_id) && (
                                      <span
                                        className="shrink-0 cursor-default rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-emerald-600 dark:text-emerald-400"
                                        title="Số còn dư trong kho sau khi trừ mọi đơn đang giữ hàng"
                                      >
                                        còn {stockLeftByUnit.get(line.equipment_unit_id)}
                                      </span>
                                    )}
                                  {shortage && (
                                    <span
                                      className="shrink-0 cursor-default rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-destructive"
                                      title={`Trong kho còn ${shortage.available}, tổng nhu cầu các đơn chưa giao ${shortage.totalDemand}${
                                        shortage.otherOrders.length > 0
                                          ? ` — đơn khác đang giữ: ${shortage.otherOrders
                                              .map(([code, qty]) => `${code} (${qty})`)
                                              .join(", ")}`
                                          : ""
                                      }`}
                                    >
                                      thiếu {shortage.shortage}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              {durationCell(type, [line.id], line.unit_price, line.charge_duration)}
                              <TableCell>
                                {canManage ? (
                                  <OrderLinePriceForm lineId={line.id} unitPrice={line.unit_price} />
                                ) : (
                                  `${currencyFormatter.format(line.unit_price)}đ`
                                )}
                                {charge && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {currencyFormatter.format(charge.basePrice)}đ/{charge.unitLabel} ×{" "}
                                    {charge.duration} {charge.unitLabel}
                                    {charge.tier &&
                                      ` · gói ≥${charge.tier.min_duration} ${charge.unitLabel} −${charge.tier.discount_percentage}%`}
                                  </p>
                                )}
                                {charge?.isCustom && (
                                  <p
                                    className="mt-0.5 text-xs text-amber-600 dark:text-amber-500"
                                    title={`Giá theo gói mặc định: ${currencyFormatter.format(charge.defaultUnitPrice)}đ`}
                                  >
                                    Giá tuỳ chỉnh
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {currencyFormatter.format(line.line_total)}đ
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-start gap-1.5">
                                  {type?.payout_percentage != null || isTransportLine ? (
                                    (isTransportLine ? canAssignTransport : canManage) ? (
                                      <OrderLineEmployeeForm
                                        lineId={line.id}
                                        employeeId={line.employee_id}
                                        employees={employeeOptionsFor(line.employee_id)}
                                        isTransportLine={isTransportLine}
                                        deliveryMethod={line.delivery_method}
                                      />
                                    ) : (
                                      (employeeNameById.get(line.employee_id ?? "") ?? "—")
                                    )
                                  ) : (
                                    !showDeliveryNote && "—"
                                  )}
                                  {showDeliveryNote &&
                                    (canAssignTransport ? (
                                      <OrderLineNoteForm lineId={line.id} note={line.note} />
                                    ) : (
                                      line.note && (
                                        <p className="max-w-[160px] text-xs whitespace-pre-wrap text-muted-foreground">
                                          {line.note}
                                        </p>
                                      )
                                    ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <ConfirmDeleteButton
                                  confirmMessage="Xoá dòng hàng này?"
                                  successMessage="Đã xoá dòng hàng."
                                  action={deleteOrderEquipmentLine}
                                  actionArg={line.id}
                                />
                              </TableCell>
                            </>
                          ),
                        };
                      };

                    // Gộp máy serial cùng sản phẩm + cùng đơn giá thành 1 dòng
                    // (kiểu Booqable, CEO 2026-09-25): SL = số máy, serial thành
                    // chip bên dưới. Chỉ gộp dòng thiết bị serial thuần — dòng
                    // dịch vụ/vận chuyển có người thực hiện, ghi chú giao nhận vẫn
                    // tách riêng từng dòng. Nhóm đứng ở vị trí máy đầu tiên.
                    const isGroupable = (line: (typeof lines)[number]) => {
                      if (!line.equipment_instance_id || !line.equipment_type_id) return false;
                      if (line.parent_line_id) return false;
                      const t = equipmentTypeById.get(line.equipment_type_id);
                      return (
                        !!t &&
                        t.payout_percentage == null &&
                        !(line.equipment_type_id in TRANSPORT_LINE_CATEGORY_BY_TYPE_ID) &&
                        !DELIVERY_NOTE_TYPE_IDS.has(line.equipment_type_id)
                      );
                    };
                    const groupKey = (line: (typeof lines)[number]) =>
                      `${line.equipment_type_id}|${line.unit_price}`;
                    const groupMembers = new Map<string, (typeof lines)[number][]>();
                    for (const line of lines) {
                      if (!isGroupable(line)) continue;
                      const key = groupKey(line);
                      groupMembers.set(key, [...(groupMembers.get(key) ?? []), line]);
                    }
                    const renderGroup = (members: (typeof lines)[number][]) => {
                      const first = members[0];
                      const type = equipmentTypeById.get(first.equipment_type_id!)!;
                      const memberIds = members.map((m) => m.id);
                      const charge = describeCharge(type, first.unit_price, first.charge_duration);
                      const chips = members.map((m) => {
                        const inst = equipmentInstanceById.get(m.equipment_instance_id!);
                        const variant = inst?.equipment_unit_id
                          ? equipmentUnitById.get(inst.equipment_unit_id)?.brand_model
                          : null;
                        const showVariant =
                          !!variant && variant !== type.name && (unitCountByType.get(type.id) ?? 0) > 1;
                        return {
                          lineId: m.id,
                          label: inst?.identifier_code ?? "—",
                          variant: showVariant ? variant : null,
                        };
                      });
                      return {
                        id: first.id,
                        memberIds,
                        content: (
                          <>
                            <TableCell className="font-medium" title={type.name}>
                              <div className="flex items-center gap-2">
                                {type.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- ảnh Supabase storage, cùng convention trang thiết bị
                                  <img src={type.image_url} alt="" className="size-8 shrink-0 rounded object-cover" />
                                ) : (
                                  <span className="bg-muted size-8 shrink-0 rounded" />
                                )}
                                <Link
                                  href={`/equipment/${type.id}`}
                                  className="truncate underline-offset-2 hover:underline"
                                >
                                  {type.name}
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell>
                              <SerialChipList items={chips} canRemove={canManage} />
                            </TableCell>
                            <TableCell className="tabular-nums">{members.length}</TableCell>
                            {durationCell(type, memberIds, first.unit_price, first.charge_duration)}
                            <TableCell>
                              {canManage ? (
                                <OrderLineGroupPriceForm lineIds={memberIds} unitPrice={first.unit_price} />
                              ) : (
                                `${currencyFormatter.format(first.unit_price)}đ`
                              )}
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                /máy
                                {charge &&
                                  ` · ${currencyFormatter.format(charge.basePrice)}đ/${charge.unitLabel} × ${charge.duration} ${charge.unitLabel}`}
                                {charge?.tier &&
                                  ` · gói ≥${charge.tier.min_duration} ${charge.unitLabel} −${charge.tier.discount_percentage}%`}
                              </p>
                              {charge?.isCustom && (
                                <p
                                  className="mt-0.5 text-xs text-amber-600 dark:text-amber-500"
                                  title={`Giá theo gói mặc định: ${currencyFormatter.format(charge.defaultUnitPrice)}đ`}
                                >
                                  Giá tuỳ chỉnh
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {currencyFormatter.format(members.reduce((sum, m) => sum + m.line_total, 0))}đ
                            </TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              <ConfirmDeleteButton
                                confirmMessage={`Xoá cả ${members.length} máy ${type.name} khỏi đơn?`}
                                successMessage="Đã xoá dòng hàng."
                                action={deleteOrderEquipmentLines}
                                actionArg={memberIds}
                              />
                            </TableCell>
                          </>
                        ),
                      };
                    };
                    // Combo (CEO 2026-09-26): 1 dòng hiển thị = dòng combo + danh
                    // sách món con kèm nút "Đổi món". Tiền combo = tổng các món
                    // con (đã chia theo giá lẻ); dòng combo tự nó 0đ.
                    const childrenByParent = new Map<string, (typeof lines)[number][]>();
                    for (const line of lines) {
                      if (!line.parent_line_id) continue;
                      childrenByParent.set(line.parent_line_id, [
                        ...(childrenByParent.get(line.parent_line_id) ?? []),
                        line,
                      ]);
                    }
                    const childLabel = (line: (typeof lines)[number]) => {
                      const t = line.equipment_type_id ? equipmentTypeById.get(line.equipment_type_id) : undefined;
                      const inst = line.equipment_instance_id
                        ? equipmentInstanceById.get(line.equipment_instance_id)
                        : undefined;
                      const detail = inst
                        ? inst.identifier_code
                        : line.equipment_unit_id && (unitCountByType.get(t?.id ?? "") ?? 0) > 1
                          ? equipmentUnitById.get(line.equipment_unit_id)?.brand_model
                          : null;
                      return [t?.name ?? "—", detail].filter(Boolean).join(" — ");
                    };
                    const renderCombo = (parent: (typeof lines)[number]) => {
                      const type = equipmentTypeById.get(parent.equipment_type_id!)!;
                      const children = childrenByParent.get(parent.id) ?? [];
                      const comboTotal = children.reduce((sum, c) => sum + c.line_total, 0);
                      const perSet = Math.round(comboTotal / Math.max(1, parent.quantity));
                      const editable = !order.completed_at && !order.cancelled_at;
                      return {
                        id: parent.id,
                        memberIds: [parent.id, ...children.map((c) => c.id)],
                        content: (
                          <>
                            <TableCell className="font-medium" title={type.name}>
                              <div className="flex items-center gap-2">
                                {type.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- ảnh Supabase storage, cùng convention trang thiết bị
                                  <img src={type.image_url} alt="" className="size-8 shrink-0 rounded object-cover" />
                                ) : (
                                  <span className="bg-muted size-8 shrink-0 rounded" />
                                )}
                                <div className="min-w-0">
                                  <Link
                                    href={`/equipment/${type.id}`}
                                    className="block truncate underline-offset-2 hover:underline"
                                  >
                                    {type.name}
                                  </Link>
                                  <Badge variant="secondary" className="mt-0.5 h-4 px-1.5 text-[10px]">
                                    Combo · {children.length} dòng món
                                  </Badge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <ul className="space-y-0.5 text-xs">
                                {children.map((c) => {
                                  const label = childLabel(c);
                                  const shortage = c.equipment_unit_id
                                    ? shortageByUnit.get(c.equipment_unit_id)
                                    : undefined;
                                  return (
                                    <li key={c.id} className="flex items-center gap-1" title={c.note ?? label}>
                                      <span className="truncate">
                                        {c.quantity > 1 && `${c.quantity}× `}
                                        {label}
                                      </span>
                                      {shortage && (
                                        <span className="shrink-0 rounded-full bg-destructive/10 px-1 text-[10px] text-destructive">
                                          thiếu {shortage.shortage}
                                        </span>
                                      )}
                                      {editable && (
                                        <ComboChildSwapButton childLineId={c.id} currentLabel={label} />
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </TableCell>
                            <TableCell className="tabular-nums">{parent.quantity}</TableCell>
                            {durationCell(type, [parent.id], perSet, parent.charge_duration)}
                            <TableCell>
                              {canManage ? (
                                <ComboPriceForm parentLineId={parent.id} unitPrice={perSet} />
                              ) : (
                                `${currencyFormatter.format(perSet)}đ`
                              )}
                              <p className="mt-0.5 text-xs text-muted-foreground">/bộ · chia theo giá lẻ từng món</p>
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {currencyFormatter.format(comboTotal)}đ
                            </TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              <ConfirmDeleteButton
                                confirmMessage={`Xoá combo "${type.name}" cùng ${children.length} dòng món bên trong?`}
                                successMessage="Đã xoá combo."
                                action={deleteOrderEquipmentLine}
                                actionArg={parent.id}
                              />
                            </TableCell>
                          </>
                        ),
                      };
                    };
                    const lineRows: { id: string; memberIds: string[]; content: React.ReactNode }[] = [];
                    for (const line of lines) {
                      if (line.parent_line_id) continue;
                      if (
                        childrenByParent.has(line.id) ||
                        (line.equipment_type_id &&
                          equipmentTypeById.get(line.equipment_type_id)?.tracking_type === "combo")
                      ) {
                        lineRows.push(renderCombo(line));
                        continue;
                      }
                      const members = isGroupable(line) ? groupMembers.get(groupKey(line)) : undefined;
                      if (members && members.length > 1) {
                        if (members[0].id === line.id) lineRows.push(renderGroup(members));
                        continue;
                      }
                      lineRows.push({ ...renderSingleLine(line), memberIds: [line.id] });
                    }

                    return canManage ? (
                      <OrderLinesSortableTable orderId={order.id} rows={lineRows} />
                    ) : (
                      <Table className={ORDER_LINES_TABLE_CLASS}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hàng hoá</TableHead>
                            <TableHead className="w-[190px]">Biến thể/Sản phẩm</TableHead>
                            <TableHead className="w-[105px]">SL</TableHead>
                            <TableHead className="w-[110px]">Số kỳ tính</TableHead>
                            <TableHead className="w-[160px]">Giá thuê</TableHead>
                            <TableHead className="w-[110px] text-right">Thành tiền</TableHead>
                            <TableHead className="w-[130px]">Người thực hiện</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineRows.map((row) => (
                            <TableRow key={row.id}>{row.content}</TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Chưa có dòng hàng nào.
                  </p>
                )}
              </div>

              {stockShortages.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-medium">
                    ⚠ Thiếu hàng tại {branchNameById.get(order.pickup_branch_id) ?? "chi nhánh"}
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    {stockShortages.map((s) => (
                      <li key={s.unitId}>
                        {s.label}: đơn này cần {s.thisOrderDemand}. Tổng nhu cầu các đơn chưa giao:{" "}
                        {s.totalDemand}, trong kho còn {s.available} — thiếu {s.shortage}.
                        {s.otherOrders.length > 0 && (
                          <span className="block text-xs text-destructive/80">
                            Đơn khác đang giữ:{" "}
                            {s.otherOrders.map(([code, qty]) => `${code} (${qty})`).join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
                <div className="flex w-64 justify-between">
                  <span className="text-muted-foreground">Tạm tính (chưa VAT)</span>
                  <span>{currencyFormatter.format(order.total_value)}đ</span>
                </div>
                <div className="flex w-64 justify-between">
                  <span className="text-muted-foreground">VAT ({VAT_RATE * 100}%)</span>
                  <span>{currencyFormatter.format(vatAmount)}đ</span>
                </div>
                <div className="flex w-64 justify-between font-medium">
                  <span>Tổng cộng (đã gồm VAT)</span>
                  <span>{currencyFormatter.format(grandTotal)}đ</span>
                </div>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                  <OrderDiscountForm
                    orderId={order.id}
                    totalValue={order.total_value}
                    rentalSubtotal={rentalSubtotal}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <Card className={accentCard("violet")}>
                <CardHeader className={accentHeader("violet")}>
                  <CardTitle className="text-base">
                    <AccentTitle accent="violet" icon={ListChecks}>
                      10 khâu tính khoán ({doneCount}/{TASK_TYPE_SEQUENCE.length})
                    </AccentTitle>
                  </CardTitle>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${(doneCount / TASK_TYPE_SEQUENCE.length) * 100}%` }}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div>
                    {TASK_TYPE_SEQUENCE.map((taskType, index) => {
                      const earlier = TASK_TYPE_SEQUENCE.slice(0, index);
                      const task = taskByType.get(taskType);
                      const isDone = !!task?.completed_date;
                      const canComplete = earlier.every((t) => taskByType.get(t)?.completed_date);
                      const status: "done" | "current" | "locked" = isDone
                        ? "done"
                        : canComplete
                          ? "current"
                          : "locked";
                      const weight = canManage ? findTaskWeight(taskWeights ?? [], taskType) : 0;
                      const isLast = index === TASK_TYPE_SEQUENCE.length - 1;
                      // Nhóm 10 khâu theo 3 giai đoạn nghiệp vụ thật (bán hàng →
                      // vận hành → hoàn tất) để dễ định vị đang ở đâu, thay vì 1
                      // danh sách phẳng 10 dòng.
                      const phaseLabel =
                        taskType === "tiep_nhan_yeu_cau"
                          ? "Bán hàng"
                          : taskType === "chuan_bi"
                            ? "Vận hành"
                            : taskType === "nghiem_thu"
                              ? "Hoàn tất"
                              : null;

                      const scanType =
                        taskType === "giao_hang_ban_giao"
                          ? "giao_hang"
                          : taskType === "thu_hoi"
                            ? "thu_hoi"
                            : null;

                      return (
                        <div key={taskType}>
                          {phaseLabel && (
                            <p className="mt-4 mb-1.5 pl-9 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase first:mt-0">
                              {phaseLabel}
                            </p>
                          )}
                          <div className="relative flex gap-3">
                            {!isLast && !TASK_PHASE_STARTS.has(TASK_TYPE_SEQUENCE[index + 1]) && (
                              <div
                                aria-hidden
                                className="absolute top-6 bottom-0 left-[11px] w-px bg-border"
                              />
                            )}
                            <div
                              className={cn(
                                "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                                status === "done" && "border-primary bg-primary text-primary-foreground",
                                status === "current" && "border-primary text-primary ring-4 ring-primary/10",
                                status === "locked" && "border-muted-foreground/30 text-muted-foreground/40",
                              )}
                            >
                              {status === "done" ? (
                                <Check className="size-3.5" />
                              ) : status === "locked" ? (
                                <Lock className="size-3" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pb-5 last:pb-0">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <OrderTaskRow
                                    orderId={order.id}
                                    taskType={taskType}
                                    label={TASK_TYPE_LABELS[taskType]}
                                    {...taskEmployeeOptions(taskType, task?.employee_id)}
                                    task={task}
                                    status={status}
                                    canUncomplete={canUncompleteTask && taskType === lastDoneTaskType}
                                  />
                                </div>
                                {scanType && status === "current" && (
                                  <RfidScanDialog
                                    orderId={order.id}
                                    branchId={
                                      scanType === "giao_hang" ? order.pickup_branch_id : order.return_branch_id
                                    }
                                    scanType={scanType}
                                  />
                                )}
                              </div>
                              {canSeeCommission && task?.employee_id && (
                                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {employeeNameById.get(task.employee_id) ?? "—"}
                                  <span className="text-muted-foreground/50">·</span>
                                  {weight}% = {currencyFormatter.format(computeTaskCommission(commissionFund, weight))}đ
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {canSeeCommission && (
                <Card className={accentCard("amber")}>
                  <CardHeader className={accentHeader("amber")}>
                    <CardTitle className="text-base">
                      <AccentTitle accent="amber" icon={Coins}>Khoán dự kiến</AccentTitle>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      %hoa hồng chi nhánh: {commissionRate}% · Tổng quỹ khoán:{" "}
                      {currencyFormatter.format(commissionFund)}đ (chỉ tính vào lương khi khâu đã hoàn
                      thành)
                      {poolExcludedTotal > 0 && (
                        <>
                          {" "}
                          — đã loại {currencyFormatter.format(poolExcludedTotal)}đ doanh số dịch vụ trả
                          khoán trực tiếp (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ thuật...) khỏi quỹ này.
                        </>
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}

              {canManage && (
                <Card className={accentCard("orange")}>
                  <CardHeader className={accentHeader("orange", "flex-row items-center justify-between")}>
                    <CardTitle className="text-base">
                      <AccentTitle accent="orange" icon={Clock}>OT (tăng ca)</AccentTitle>
                    </CardTitle>
                    <OvertimeDialog orderId={order.id} employees={activeEmployeeList} />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(overtimeEntries ?? []).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {employeeNameById.get(entry.employee_id) ?? "—"} ·{" "}
                              {currencyFormatter.format(entry.amount)}đ
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.entry_date}
                              {entry.hours ? ` · ${entry.hours} giờ` : ""}
                            </p>
                            {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                          </div>
                          <ConfirmDeleteButton
                            confirmMessage="Xoá khoản OT này?"
                            successMessage="Đã xoá OT."
                            action={deleteOvertimeEntry}
                            actionArg={entry.id}
                          />
                        </div>
                      ))}
                      {!overtimeEntries?.length && (
                        <p className="text-sm text-muted-foreground">Chưa ghi nhận OT nào.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className={accentCard("emerald")}>
              <CardHeader className={accentHeader("emerald", "flex-row items-center justify-between")}>
                <CardTitle className="text-base">
                  <AccentTitle accent="emerald" icon={Wallet}>Thanh toán</AccentTitle>
                </CardTitle>
                <div className="flex gap-1">
                  <OrderPaymentDialog orderId={order.id} defaultAmount={remaining} />
                  {rawDeposit > 0 && (
                    <>
                      <OrderPaymentDialog
                        orderId={order.id}
                        paymentType="deposit_collect"
                        defaultAmount={Math.max(totalDeposit - depositCollected, 0)}
                      />
                      <OrderPaymentDialog
                        orderId={order.id}
                        paymentType="deposit_refund"
                        defaultAmount={depositRefundSuggestion}
                      />
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Cần thanh toán</p>
                    <p className="font-medium">{currencyFormatter.format(grandTotal)}đ</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Đã thanh toán</p>
                    <p className="font-medium">{currencyFormatter.format(totalPaid)}đ</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Còn lại</p>
                    <p className="font-medium">{currencyFormatter.format(remaining)}đ</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trạng thái</p>
                    <Badge variant={remaining <= 0 ? "default" : totalPaid > 0 ? "outline" : "secondary"}>
                      {paymentStatus}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  {invoicePaymentList.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{currencyFormatter.format(payment.amount)}đ</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.paid_at} · {PAYMENT_METHOD_LABELS[payment.method]}
                        </p>
                        {payment.note && (
                          <p className="text-xs text-muted-foreground">{payment.note}</p>
                        )}
                      </div>
                      {canManage && (
                        <ConfirmDeleteButton
                          confirmMessage="Xoá lần thanh toán này?"
                          successMessage="Đã xoá thanh toán."
                          action={deleteOrderPayment}
                          actionArg={payment.id}
                        />
                      )}
                    </div>
                  ))}
                  {!invoicePaymentList.length && (
                    <p className="text-sm text-muted-foreground">Chưa có thanh toán nào.</p>
                  )}
                </div>

                {rawDeposit > 0 && (
                  <div className="space-y-4 border-t pt-4">
                    <p className="text-sm font-medium">Tiền cọc</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Cọc dự kiến</p>
                        <p className="font-medium">
                          {customerDepositPercentage <= 0
                            ? "Miễn cọc"
                            : `${currencyFormatter.format(totalDeposit)}đ`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Đang giữ</p>
                        <p className="font-medium">{currencyFormatter.format(depositHeld)}đ</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Đã thu cọc</p>
                        <p className="font-medium">{currencyFormatter.format(depositCollected)}đ</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Đã hoàn cọc</p>
                        <p className="font-medium">{currencyFormatter.format(depositRefunded)}đ</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {customerDepositPercentage < 100 && customerDepositPercentage > 0 && (
                        <>Khách hàng được áp tỉ lệ cọc {customerDepositPercentage}%. </>
                      )}
                      Thu cùng lúc với đơn (không tính VAT), hoàn lại cho khách sau khi hoàn thành khâu
                      Nghiệm thu.
                      {!taskByType.get("nghiem_thu")?.completed_date &&
                        depositCollected > depositRefunded && (
                          <> Đơn chưa hoàn thành khâu Nghiệm thu.</>
                        )}
                    </p>
                    {depositRefundSuggestion !== depositHeld && (
                      <p className="text-xs text-muted-foreground">
                        Đơn đã bị sửa sau khi thu/hoàn cọc khiến tiền hoá đơn lệch so với ban đầu — nút
                        &quot;Hoàn cọc&quot; tự bù trừ, gợi ý hoàn{" "}
                        <span className="font-medium">
                          {currencyFormatter.format(depositRefundSuggestion)}đ
                        </span>{" "}
                        thay vì {currencyFormatter.format(depositHeld)}đ đang giữ.
                      </p>
                    )}

                    <div className="space-y-2">
                      {depositPaymentList.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {ORDER_PAYMENT_TYPE_LABELS[payment.payment_type]} ·{" "}
                              {currencyFormatter.format(payment.amount)}đ
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {payment.paid_at} · {PAYMENT_METHOD_LABELS[payment.method]}
                            </p>
                            {payment.note && (
                              <p className="text-xs text-muted-foreground">{payment.note}</p>
                            )}
                          </div>
                          {canManage && (
                            <ConfirmDeleteButton
                              confirmMessage="Xoá lần cọc này?"
                              successMessage="Đã xoá."
                              action={deleteOrderPayment}
                              actionArg={payment.id}
                            />
                          )}
                        </div>
                      ))}
                      {!depositPaymentList.length && (
                        <p className="text-sm text-muted-foreground">Chưa ghi nhận thu/hoàn cọc nào.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

      <OrderComments
        orderId={order.id}
        comments={orderComments}
        canDelete={employee?.role === "giam_doc"}
      />
    </div>
  );
}
