import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import type { TaskType } from "@/types/database";
import { cn } from "@/lib/utils";
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
import { deleteOrderEquipmentLine } from "@/lib/actions/orders";
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
import { SendDocumentEmailDialog } from "./send-document-email-dialog";
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
    supabase.from("employees_public").select("id, name").order("name"),
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
  }>((from, to) =>
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, equipment_unit_id, identifier_code, status")
      .range(from, to),
  );

  // Danh sách customers ở trên bị Supabase giới hạn 1.000 dòng (nay có hơn
  // 5.800 khách hàng) nên không đảm bảo chứa đúng khách của đơn này — luôn
  // tra thẳng theo customer_id để tên/tỉ lệ cọc hiển thị đúng bất kể thứ tự.
  const { data: orderCustomer } = await supabase
    .from("customers")
    .select("id, name, email, deposit_percentage")
    .eq("id", order.customer_id)
    .maybeSingle();

  const canManage = !!employee && MANAGE_ROLES.includes(employee.role);
  // Dòng vận chuyển (giao/thu hồi xe máy) — Cửa hàng trưởng/Kỹ thuật-Sale
  // được tự điền (theo yêu cầu CEO), khác các dòng dịch vụ tĩnh khác chỉ
  // canManage mới sửa được.
  const canAssignTransport = canManage || (!!employee && BRANCH_SCOPED_ROLES.includes(employee.role));
  const branchList = branches ?? [];
  const employeeList = employees ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const employeeNameById = new Map(employeeList.map((e) => [e.id, e.name]));
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
  const commissionRate = canManage
    ? findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, poolValue)
    : 0;
  const commissionFund = canManage ? computeOrderCommissionFund(poolValue, commissionRate) : 0;

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
    if (type?.product_type !== "rental") return sum;
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
  function describeCharge(type: (NonNullable<typeof equipmentTypes>)[number], unitPrice: number) {
    if (
      type.product_type !== "rental" ||
      !type.rental_period_unit ||
      !orderRentalStartAt ||
      !orderRentalEndAt
    )
      return null;
    const duration = computeRentalDurationInUnit(
      orderRentalStartAt,
      orderRentalEndAt,
      type.rental_period_unit,
    );
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
  const quickAddOptions = (equipmentTypes ?? []).flatMap((t) => {
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin đơn</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thời gian thuê</CardTitle>
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

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Danh sách thiết bị</CardTitle>
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
              <div className="overflow-x-auto">
                {lines?.length ? (
                  (() => {
                    const lineRows = lines.map((line) => {
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
                        const charge = type ? describeCharge(type, line.unit_price) : null;
                        return {
                          id: line.id,
                          content: (
                            <>
                              <TableCell
                                className="max-w-[200px] font-medium"
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
                              <TableCell className="max-w-[140px] truncate" title={detail}>
                                {detail}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
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
                              <TableCell>
                                {canManage ? (
                                  <OrderLinePriceForm lineId={line.id} unitPrice={line.unit_price} />
                                ) : (
                                  `${currencyFormatter.format(line.unit_price)}đ`
                                )}
                                {charge && (
                                  <p className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                                    {currencyFormatter.format(charge.basePrice)}đ/{charge.unitLabel} ×{" "}
                                    {charge.duration} {charge.unitLabel}
                                    {charge.tier &&
                                      ` · gói ≥${charge.tier.min_duration} ${charge.unitLabel} −${charge.tier.discount_percentage}%`}
                                  </p>
                                )}
                                {charge?.isCustom && (
                                  <p
                                    className="mt-0.5 text-xs whitespace-nowrap text-amber-600 dark:text-amber-500"
                                    title={`Giá theo gói mặc định: ${currencyFormatter.format(charge.defaultUnitPrice)}đ`}
                                  >
                                    Giá tuỳ chỉnh
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>{currencyFormatter.format(line.line_total)}đ</TableCell>
                              <TableCell>
                                <div className="flex flex-col items-start gap-1.5">
                                  {type?.payout_percentage != null || isTransportLine ? (
                                    (isTransportLine ? canAssignTransport : canManage) ? (
                                      <OrderLineEmployeeForm
                                        lineId={line.id}
                                        employeeId={line.employee_id}
                                        employees={employeeList}
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
                      });

                    return canManage ? (
                      <OrderLinesSortableTable orderId={order.id} rows={lineRows} />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hàng hoá</TableHead>
                            <TableHead>Biến thể/Sản phẩm</TableHead>
                            <TableHead>SL</TableHead>
                            <TableHead>Giá thuê</TableHead>
                            <TableHead>Thành tiền</TableHead>
                            <TableHead>Người thực hiện</TableHead>
                            <TableHead className="w-16"></TableHead>
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    10 khâu tính khoán ({doneCount}/{TASK_TYPE_SEQUENCE.length})
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
                                    employees={employeeList}
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
                              {canManage && task?.employee_id && (
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

              {canManage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Khoán dự kiến</CardTitle>
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
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base">OT (tăng ca)</CardTitle>
                    <OvertimeDialog orderId={order.id} employees={employeeList} />
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

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Thanh toán</CardTitle>
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
    </div>
  );
}
