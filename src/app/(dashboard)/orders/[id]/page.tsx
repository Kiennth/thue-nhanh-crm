import { notFound } from "next/navigation";
import { Plus, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getCurrentEmployee } from "@/lib/dal";
import { deleteOrderEquipmentLine } from "@/lib/actions/orders";
import { deleteOrderPayment } from "@/lib/actions/order-payments";
import {
  PAYMENT_METHOD_LABELS,
  TASK_TYPE_LABELS,
  TASK_TYPE_SEQUENCE,
  VAT_RATE,
} from "@/lib/order-labels";
import {
  findCommissionRate,
  computeOrderCommissionFund,
  computeTaskCommission,
  findTaskWeight,
} from "@/lib/commission";
import { OrderDialog } from "../order-dialog";
import { AddOrderLineDialog } from "./add-order-line-dialog";
import { OrderTaskRow } from "./order-task-row";
import { OrderTotalForm } from "./order-total-form";
import { OrderLinePriceForm } from "./order-line-price-form";
import { OrderLineQuantityForm } from "./order-line-quantity-form";
import { RentalPeriodForm } from "./rental-period-form";
import CloseOrderButton from "./close-order-button";
import { CancelOrderButton } from "./cancel-order-button";
import { DuplicateOrderButton } from "./duplicate-order-button";
import { ReopenOrderButton } from "./reopen-order-button";
import { OrderPaymentDialog } from "./order-payment-dialog";
import { RfidScanDialog } from "./rfid-scan-dialog";

const MANAGE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: order },
    { data: lines },
    { data: tasks },
    { data: payments },
    { data: branches },
    { data: customers },
    { data: employees },
    { data: equipmentTypes },
    { data: equipmentUnits },
    { data: equipmentInstances },
    { data: equipmentStock },
    { data: commissionTiers },
    { data: taskWeights },
    employee,
  ] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_equipment").select("*").eq("order_id", id).order("created_at"),
    supabase.from("order_tasks").select("*").eq("order_id", id),
    supabase.from("order_payments").select("*").eq("order_id", id).order("paid_at"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("employees_public").select("id, name").order("name"),
    supabase
      .from("equipment_types")
      .select("id, name, product_type, tracking_type, pricing_method, price, deposit_amount")
      .order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, identifier_code, status"),
    supabase.from("equipment_stock").select("equipment_unit_id, branch_id, quantity_available"),
    supabase.from("commission_tiers").select("*"),
    supabase.from("task_weights").select("*"),
    getCurrentEmployee(),
  ]);

  if (!order) {
    notFound();
  }

  const canManage = !!employee && MANAGE_ROLES.includes(employee.role);
  const branchList = branches ?? [];
  const customerList = customers ?? [];
  const employeeList = employees ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const customerNameById = new Map(customerList.map((c) => [c.id, c.name]));
  const employeeNameById = new Map(employeeList.map((e) => [e.id, e.name]));
  const equipmentTypeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const equipmentUnitById = new Map((equipmentUnits ?? []).map((u) => [u.id, u]));
  const equipmentInstanceById = new Map((equipmentInstances ?? []).map((i) => [i.id, i]));

  const taskByType = new Map((tasks ?? []).map((t) => [t.task_type, t]));
  const doneCount = (tasks ?? []).filter((t) => t.completed_date).length;
  const allDone = doneCount === TASK_TYPE_SEQUENCE.length;

  const commissionRate = canManage
    ? findCommissionRate(commissionTiers ?? [], order.branch_id, order.total_value)
    : 0;
  const commissionFund = canManage ? computeOrderCommissionFund(order.total_value, commissionRate) : 0;

  // Giá trong đơn (total_value) chưa gồm VAT — chỉ cộng thêm để hiển thị số
  // tổng phải thu của khách, không dùng số đã gồm VAT để tính khoán.
  const vatAmount = Math.round(order.total_value * VAT_RATE * 100) / 100;
  const grandTotal = order.total_value + vatAmount;

  const paymentList = payments ?? [];
  const totalPaid = paymentList.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const paymentStatus =
    totalPaid <= 0 ? "Chưa thanh toán" : remaining <= 0 ? "Đã thanh toán đủ" : "Thanh toán một phần";

  // Tiền cọc = tổng (số lượng x cọc/đơn vị) của các dòng hàng CHO THUÊ trong
  // đơn, làm tròn đến triệu cho gọn — không tính VAT, thu cùng lúc với đơn,
  // hoàn lại sau khi nghiệm thu (khâu "Nghiệm thu").
  const rawDeposit = (lines ?? []).reduce((sum, line) => {
    const type = equipmentTypeById.get(line.equipment_type_id);
    if (type?.product_type !== "rental") return sum;
    return sum + (type.deposit_amount ?? 0) * line.quantity;
  }, 0);
  const totalDeposit = Math.round(rawDeposit / 1_000_000) * 1_000_000;

  // Cảnh báo thiếu hàng: so số lượng sẵn có tại chi nhánh của đơn với tổng
  // nhu cầu của TẤT CẢ đơn CHƯA hoàn tất đang giữ cùng biến thể đó tại chi
  // nhánh này (không chỉ riêng đơn đang xem) — hệ thống chưa có cơ chế đặt
  // trước/khoá kho theo đơn, đây chỉ là con số tổng hợp để biết mà lên kế
  // hoạch xử lý (mua thêm/điều chuyển), KHÔNG chặn lưu đơn.
  const availableByUnit = new Map(
    (equipmentStock ?? [])
      .filter((s) => s.branch_id === order.branch_id)
      .map((s) => [s.equipment_unit_id, s.quantity_available]),
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
    branch_id: string;
    completed_at: string | null;
    cancelled_at: string | null;
    rental_start_at: string | null;
    rental_end_at: string | null;
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
      .select("id, order_code, branch_id, completed_at, cancelled_at, rental_start_at, rental_end_at")
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
  // nhánh của đơn — gồm cả đơn đang xem. Với hàng cho thuê (product_type =
  // rental), chỉ tính là "giữ chỗ" nếu khung thời gian thuê của đơn kia giao
  // với khung thời gian của đơn đang xem — hàng cho thuê ở hai khung giờ khác
  // nhau không thật sự tranh chấp kho. Hàng bán/dịch vụ vẫn tính gộp không
  // phân biệt thời gian vì tiêu hao kho vĩnh viễn.
  const activeDemandByUnit = new Map<string, { orderId: string; orderCode: string; quantity: number }[]>();
  for (const row of reservationLines) {
    if (!row.equipment_unit_id) continue;
    const ord = reservationOrderById.get(row.order_id);
    if (!ord || ord.branch_id !== order.branch_id || ord.completed_at || ord.cancelled_at) continue;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <OrderDialog
            branches={branchList}
            customers={customerList}
            order={order}
            trigger={<Button variant="outline">Sửa</Button>}
          />
          <DuplicateOrderButton orderId={order.id} />
          {!order.completed_at && !order.cancelled_at && (
            <>
              <CloseOrderButton orderId={order.id} disabled={!allDone} />
              <CancelOrderButton orderId={order.id} />
            </>
          )}
          {order.completed_at && canManage && <ReopenOrderButton orderId={order.id} />}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Chi nhánh</p>
            <p className="font-medium">{branchNameById.get(order.branch_id) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Khách hàng</p>
            <p className="font-medium">{customerNameById.get(order.customer_id) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ngày</p>
            <p className="font-medium">{order.order_date}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Doanh số</p>
            <p className="font-medium">{currencyFormatter.format(order.total_value)}đ</p>
          </div>
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

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Danh sách thiết bị</CardTitle>
          <AddOrderLineDialog
            orderId={order.id}
            equipmentTypes={equipmentTypes ?? []}
            equipmentUnits={equipmentUnits ?? []}
            equipmentInstances={equipmentInstances ?? []}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Thêm dòng hàng
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng hoá</TableHead>
                <TableHead>Biến thể/Sản phẩm</TableHead>
                <TableHead>SL</TableHead>
                <TableHead>Đơn giá</TableHead>
                <TableHead>Thành tiền</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines?.map((line) => {
                const type = equipmentTypeById.get(line.equipment_type_id);
                const detail = line.equipment_unit_id
                  ? equipmentUnitById.get(line.equipment_unit_id)?.brand_model
                  : line.equipment_instance_id
                    ? equipmentInstanceById.get(line.equipment_instance_id)?.identifier_code
                    : "—";
                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{type?.name ?? "—"}</TableCell>
                    <TableCell>{detail ?? "—"}</TableCell>
                    <TableCell>
                      {canManage && !line.equipment_instance_id ? (
                        <OrderLineQuantityForm lineId={line.id} quantity={line.quantity} />
                      ) : (
                        line.quantity
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <OrderLinePriceForm lineId={line.id} unitPrice={line.unit_price} />
                      ) : (
                        `${currencyFormatter.format(line.unit_price)}đ`
                      )}
                    </TableCell>
                    <TableCell>{currencyFormatter.format(line.line_total)}đ</TableCell>
                    <TableCell>
                      <ConfirmDeleteButton
                        confirmMessage="Xoá dòng hàng này?"
                        successMessage="Đã xoá dòng hàng."
                        action={deleteOrderEquipmentLine}
                        actionArg={line.id}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!lines?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Chưa có dòng hàng nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {stockShortages.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">⚠ Thiếu hàng tại {branchNameById.get(order.branch_id) ?? "chi nhánh"}</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {stockShortages.map((s) => (
                  <li key={s.unitId}>
                    {s.label}: đơn này cần {s.thisOrderDemand}. Tổng nhu cầu các đơn chưa hoàn tất:{" "}
                    {s.totalDemand}, kho có {s.available} — thiếu {s.shortage}.
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

          {canManage && <OrderTotalForm orderId={order.id} totalValue={order.total_value} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Thanh toán</CardTitle>
          <OrderPaymentDialog
            orderId={order.id}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Thêm thanh toán
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Hình thức</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentList.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.paid_at}</TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                  <TableCell>{currencyFormatter.format(payment.amount)}đ</TableCell>
                  <TableCell className="text-muted-foreground">{payment.note ?? "—"}</TableCell>
                  <TableCell>
                    {canManage && (
                      <ConfirmDeleteButton
                        confirmMessage="Xoá lần thanh toán này?"
                        successMessage="Đã xoá thanh toán."
                        action={deleteOrderPayment}
                        actionArg={payment.id}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!paymentList.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Chưa có thanh toán nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalDeposit > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiền cọc</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{currencyFormatter.format(totalDeposit)}đ</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Thu cùng lúc với đơn (không tính VAT), hoàn lại cho khách sau khi hoàn thành khâu
              Nghiệm thu.
            </p>
          </CardContent>
        </Card>
      )}

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
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            10 khâu tính khoán ({doneCount}/{TASK_TYPE_SEQUENCE.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {TASK_TYPE_SEQUENCE.map((taskType, index) => {
              const earlier = TASK_TYPE_SEQUENCE.slice(0, index);
              const canComplete = earlier.every((t) => taskByType.get(t)?.completed_date);
              const task = taskByType.get(taskType);
              const weight = canManage ? findTaskWeight(taskWeights ?? [], taskType) : 0;

              const scanType =
                taskType === "giao_hang_ban_giao" ? "giao_hang" : taskType === "thu_hoi" ? "thu_hoi" : null;

              return (
                <div key={taskType}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <OrderTaskRow
                        orderId={order.id}
                        taskType={taskType}
                        label={TASK_TYPE_LABELS[taskType]}
                        employees={employeeList}
                        task={task}
                        canComplete={canComplete}
                      />
                    </div>
                    {scanType && !task?.completed_date && (
                      <RfidScanDialog
                        orderId={order.id}
                        branchId={order.branch_id}
                        scanType={scanType}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Radio className="size-4" />
                            Quét RFID
                          </Button>
                        }
                      />
                    )}
                  </div>
                  {canManage && task?.employee_id && (
                    <p className="pb-1 text-xs text-muted-foreground">
                      {employeeNameById.get(task.employee_id) ?? "—"} · {weight}% ={" "}
                      {currencyFormatter.format(computeTaskCommission(commissionFund, weight))}đ
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
