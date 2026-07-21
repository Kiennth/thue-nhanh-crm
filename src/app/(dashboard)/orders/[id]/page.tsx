import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
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
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
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
import { RentalPeriodForm } from "./rental-period-form";
import CloseOrderButton from "./close-order-button";

const MANAGE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: order },
    { data: lines },
    { data: tasks },
    { data: branches },
    { data: customers },
    { data: employees },
    { data: equipmentTypes },
    { data: equipmentUnits },
    { data: equipmentInstances },
    { data: commissionTiers },
    { data: taskWeights },
    employee,
  ] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_equipment").select("*").eq("order_id", id).order("created_at"),
    supabase.from("order_tasks").select("*").eq("order_id", id),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("employees_public").select("id, name").order("name"),
    supabase
      .from("equipment_types")
      .select("id, name, product_type, tracking_type, pricing_method, price")
      .order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, identifier_code, status"),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{order.order_code}</h1>
          {order.completed_at ? (
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
          {!order.completed_at && <CloseOrderButton orderId={order.id} disabled={!allDone} />}
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
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>{currencyFormatter.format(line.unit_price)}đ</TableCell>
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

          {canManage && <OrderTotalForm orderId={order.id} totalValue={order.total_value} />}
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

              return (
                <div key={taskType}>
                  <OrderTaskRow
                    orderId={order.id}
                    taskType={taskType}
                    label={TASK_TYPE_LABELS[taskType]}
                    employees={employeeList}
                    task={task}
                    canComplete={canComplete}
                  />
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
