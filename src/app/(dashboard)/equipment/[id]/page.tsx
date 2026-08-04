import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PaginationControls } from "@/components/pagination-controls";
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import {
  deleteEquipmentType,
  deleteEquipmentUnit,
  deleteEquipmentStock,
  deleteEquipmentInstance,
} from "@/lib/actions/equipment";
import {
  EQUIPMENT_INSTANCE_STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
} from "@/lib/equipment-labels";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { EquipmentTypeDialog } from "../equipment-type-dialog";
import { EquipmentUnitDialog } from "../equipment-unit-dialog";
import { EquipmentStockDialog } from "../equipment-stock-dialog";
import { TransferStockDialog } from "../transfer-stock-dialog";
import { EquipmentInstanceDialog } from "../equipment-instance-dialog";
import { EquipmentInstanceDisposeDialog } from "../equipment-instance-dispose-dialog";
import { EquipmentPurchaseDialog } from "../equipment-purchase-dialog";
import { EquipmentCostAdjustmentDialog } from "../equipment-cost-adjustment-dialog";
import { EquipmentDisposalDialog } from "../equipment-disposal-dialog";
import { RfidTagDialog } from "../rfid-tag-dialog";
import type { Database, TaskType } from "@/types/database";

type EquipmentUnitRow = Database["public"]["Tables"]["equipment_units"]["Row"];
type EquipmentInstanceRow = Database["public"]["Tables"]["equipment_instances"]["Row"];
type EquipmentStockRow = Database["public"]["Tables"]["equipment_stock"]["Row"];
type EquipmentTransferRow = Database["public"]["Tables"]["equipment_transfers"]["Row"];
type RfidTagRow = {
  id: string;
  tag_code: string;
  equipment_unit_id: string | null;
  equipment_instance_id: string | null;
};

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE });

// Trước đây tab "Lịch sử thuê" chỉ .limit(50) không phân trang — sản phẩm
// nào có trên 50 lượt thuê thì các đơn cũ hơn biến mất khỏi màn hình dù
// vẫn còn nguyên trong DB (phát hiện qua đối chiếu với Booqable, thiếu hẳn
// lịch sử 2024). Chuyển sang phân trang thật giống trang Nhật ký hoạt động.
const RENTAL_PAGE_SIZE = 50;

const INSTANCE_STATUS_VARIANT = {
  available: "default",
  rented: "secondary",
  maintenance: "destructive",
  disposed: "outline",
} as const;

const TABS = [
  { value: "stock", label: "Tồn kho" },
  { value: "rentals", label: "Lịch sử thuê" },
  { value: "history", label: "Lịch sử chuyển kho" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// Dùng chung 1 cặp param sort/dir cho cả 2 bảng (Tồn kho theo từng cái +
// Lịch sử thuê) — không đụng nhau vì chỉ 1 bảng hiển thị tuỳ theo tab.
const SORT_KEYS = [
  "branch",
  "status",
  "order_code",
  "customer",
  "start",
  "end",
  "quantity",
  "revenue",
] as const;
type SortKey = (typeof SORT_KEYS)[number];
function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const { id } = await params;
  const { tab, sort, dir, page: pageParam } = await searchParams;
  const activeTab: Tab = tab === "history" ? "history" : tab === "rentals" ? "rentals" : "stock";
  const requestedRentalPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  const [{ data: type }, { data: templates }, { data: branches }, employee] = await Promise.all([
    supabase.from("equipment_types").select("*").eq("id", id).maybeSingle(),
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("branches").select("id, name, position").order("position"),
    getCurrentEmployee(),
  ]);
  if (!type) notFound();

  const isRentalQuantity = type.product_type === "rental" && type.tracking_type === "quantity";
  const isRentalIndividual = type.product_type === "rental" && type.tracking_type === "individual";
  const isSale = type.product_type === "sale";
  const isService = type.product_type === "service";
  const showUnitsBlock = isRentalQuantity || isSale;
  // Hàng serialize giờ CŨNG có thể có biến thể (tuỳ chọn, xem migration
  // 20260802040000) — nhưng khác quantity/sale, biến thể của hàng serialize
  // KHÔNG có bảng tồn kho/mua/thanh lý riêng (equipment_stock) đi kèm, vì tồn
  // kho của nó chính là danh sách máy bên dưới. Nên tách cờ riêng thay vì
  // gộp vào showUnitsBlock.
  const showVariantsForIndividual = isRentalIndividual;

  const [{ data: units }, { data: instances }] = await Promise.all([
    showUnitsBlock || showVariantsForIndividual
      ? supabase.from("equipment_units").select("*").eq("equipment_type_id", id).order("brand_model")
      : Promise.resolve({ data: [] as EquipmentUnitRow[] }),
    // Tab "Lịch sử thuê" cần tra identifier_code kể cả khi loại hàng đang
    // tracking_type='quantity' — vài loại cũ bị đổi tracking_type mà chưa dọn
    // hết equipment_instances, nên dòng thuê lịch sử vẫn trỏ vào instance
    // thật (xem equipment-reports.ts). Bảng "Tồn kho" vẫn chỉ hiện khi
    // isRentalIndividual (isRentalIndividual && ... bên dưới).
    isRentalIndividual || activeTab === "rentals"
      ? supabase.from("equipment_instances").select("*").eq("equipment_type_id", id).order("identifier_code")
      : Promise.resolve({ data: [] as EquipmentInstanceRow[] }),
  ]);

  const unitList = units ?? [];
  const unitIds = unitList.map((u) => u.id);
  const instanceIds = (instances ?? []).map((i) => i.id);

  const [{ data: stock }, { data: unitRfidTags }, { data: instanceRfidTags }, { data: transfers }] =
    await Promise.all([
      unitIds.length
        ? supabase.from("equipment_stock").select("*").in("equipment_unit_id", unitIds)
        : Promise.resolve({ data: [] as EquipmentStockRow[] }),
      unitIds.length
        ? supabase
            .from("rfid_tags")
            .select("id, tag_code, equipment_unit_id, equipment_instance_id")
            .in("equipment_unit_id", unitIds)
        : Promise.resolve({ data: [] as RfidTagRow[] }),
      instanceIds.length
        ? supabase
            .from("rfid_tags")
            .select("id, tag_code, equipment_unit_id, equipment_instance_id")
            .in("equipment_instance_id", instanceIds)
        : Promise.resolve({ data: [] as RfidTagRow[] }),
      activeTab === "history" && unitIds.length
        ? supabase
            .from("equipment_transfers")
            .select("*")
            .in("equipment_unit_id", unitIds)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as EquipmentTransferRow[] }),
    ]);
  const rfidTags = [...(unitRfidTags ?? []), ...(instanceRfidTags ?? [])];

  // Lịch sử thuê — chỉ tải khi mở đúng tab (giống lịch sử chuyển kho): lấy
  // dòng order_equipment của loại hàng này trước, rồi tra ngược sang
  // orders/customers (không dùng nested select — codebase này join tay bằng
  // Map cho nhất quán với các trang khác).
  const { count: rentalTotalCount } =
    activeTab === "rentals"
      ? await supabase
          .from("order_equipment")
          .select("id", { count: "exact", head: true })
          .eq("equipment_type_id", id)
      : { count: 0 };
  const rentalTotalPages = Math.max(1, Math.ceil((rentalTotalCount ?? 0) / RENTAL_PAGE_SIZE));
  const rentalPage = Math.min(requestedRentalPage, rentalTotalPages);

  // Không phân trang ở bước này: order_equipment không có ngày thuê (nằm bên
  // orders.rental_start_at), nên phải tải hết dòng của loại hàng này, ghép
  // sang orders rồi mới sắp xếp theo ngày thuê được — phân trang thật sự làm
  // ở bước cắt mảng sortedRentalRows bên dưới, sau khi đã sắp xếp xong.
  const { data: rentalLines } =
    activeTab === "rentals"
      ? await supabase
          .from("order_equipment")
          .select("id, order_id, equipment_instance_id, equipment_unit_id, quantity, line_total")
          .eq("equipment_type_id", id)
      : { data: [] as { id: string; order_id: string; equipment_instance_id: string | null; equipment_unit_id: string | null; quantity: number; line_total: number }[] };

  const rentalOrderIds = [...new Set((rentalLines ?? []).map((l) => l.order_id))];
  const { data: rentalOrders } = rentalOrderIds.length
    ? await supabase
        .from("orders")
        .select("id, order_code, customer_id, rental_start_at, rental_end_at, status, completed_at, cancelled_at")
        .in("id", rentalOrderIds)
    : { data: [] as { id: string; order_code: string; customer_id: string; rental_start_at: string | null; rental_end_at: string | null; status: TaskType; completed_at: string | null; cancelled_at: string | null }[] };
  const rentalOrderById = new Map((rentalOrders ?? []).map((o) => [o.id, o]));

  const rentalCustomerIds = [...new Set((rentalOrders ?? []).map((o) => o.customer_id))];
  const { data: rentalCustomers } = rentalCustomerIds.length
    ? await supabase.from("customers").select("id, name").in("id", rentalCustomerIds)
    : { data: [] as { id: string; name: string }[] };
  const rentalCustomerNameById = new Map((rentalCustomers ?? []).map((c) => [c.id, c.name]));

  function rentalStatusLabel(o: { status: TaskType; completed_at: string | null; cancelled_at: string | null }) {
    if (o.cancelled_at) return "Đã huỷ";
    if (o.completed_at) return "Hoàn tất";
    return TASK_TYPE_LABELS[o.status];
  }

  const employeeChecked = employee;
  const canManageCatalog = !!employeeChecked && MANAGE_ROLES.includes(employeeChecked.role);
  const canManageStock = !!employeeChecked && EQUIPMENT_WRITE_ROLES.includes(employeeChecked.role);
  const branchList = branches ?? [];
  const templateList = templates ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const branchPositionById = new Map(branchList.map((b, idx) => [b.id, b.position ?? idx]));
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));

  const stockByUnit = new Map<string, NonNullable<typeof stock>>();
  for (const row of stock ?? []) {
    const list = stockByUnit.get(row.equipment_unit_id) ?? [];
    list.push(row);
    stockByUnit.set(row.equipment_unit_id, list);
  }
  // Chi nhánh hiển thị theo thứ tự cố định (Hà Nội > TP HCM > Đà Nẵng >
  // HQ, xem branches.position) thay vì thứ tự trả về ngẫu nhiên của
  // equipment_stock.
  for (const list of stockByUnit.values()) {
    list.sort((a, b) => (branchPositionById.get(a.branch_id) ?? 0) - (branchPositionById.get(b.branch_id) ?? 0));
  }

  const rfidTagsByUnit = new Map<string, NonNullable<typeof rfidTags>>();
  const rfidTagsByInstance = new Map<string, NonNullable<typeof rfidTags>>();
  for (const tag of rfidTags ?? []) {
    if (tag.equipment_unit_id) {
      const list = rfidTagsByUnit.get(tag.equipment_unit_id) ?? [];
      list.push(tag);
      rfidTagsByUnit.set(tag.equipment_unit_id, list);
    } else if (tag.equipment_instance_id) {
      const list = rfidTagsByInstance.get(tag.equipment_instance_id) ?? [];
      list.push(tag);
      rfidTagsByInstance.set(tag.equipment_instance_id, list);
    }
  }

  const unitById = new Map(unitList.map((u) => [u.id, u]));
  const instanceById = new Map((instances ?? []).map((i) => [i.id, i]));

  // Sắp xếp bảng sản phẩm theo từng cái (Chi nhánh/Trạng thái) — mặc định
  // giữ nguyên thứ tự mã định danh khi chưa chọn cột nào.
  const activeDirMult = activeDir === "asc" ? 1 : -1;
  const sortedInstances = [...(instances ?? [])].sort((a, b) => {
    if (activeSort === "branch") {
      const branchA = branchNameById.get(a.branch_id ?? "") ?? "—";
      const branchB = branchNameById.get(b.branch_id ?? "") ?? "—";
      return activeDirMult * branchA.localeCompare(branchB, "vi");
    }
    if (activeSort === "status") {
      return (
        activeDirMult *
        EQUIPMENT_INSTANCE_STATUS_LABELS[a.status].localeCompare(
          EQUIPMENT_INSTANCE_STATUS_LABELS[b.status],
          "vi",
        )
      );
    }
    return a.identifier_code.localeCompare(b.identifier_code, "vi");
  });

  // Ghép + sắp xếp bảng lịch sử thuê — bỏ dòng nào không tra được order (dữ
  // liệu mồ côi, không nên xảy ra nhưng phòng hờ).
  const rentalRows = (rentalLines ?? [])
    .map((line) => {
      const order = rentalOrderById.get(line.order_id);
      if (!order) return null;
      const productLabel = line.equipment_instance_id
        ? (instanceById.get(line.equipment_instance_id)?.identifier_code ?? "—")
        : line.equipment_unit_id
          ? (unitById.get(line.equipment_unit_id)?.brand_model ?? "—")
          : "—";
      return {
        line,
        order,
        customerName: rentalCustomerNameById.get(order.customer_id) ?? "—",
        productLabel,
        statusLabel: rentalStatusLabel(order),
      };
    })
    .filter((r) => r !== null);

  // Chưa chọn cột nào thì mặc định xếp theo ngày bắt đầu thuê, mới nhất lên
  // đầu — trước đây mặc định giữ nguyên thứ tự trả về của DB (không phải
  // ngày thuê), khiến đơn cũ lẫn với đơn mới tuỳ vào lúc dòng order_equipment
  // được ghi/sửa gần đây (vd sau khi chạy migration gộp SKU).
  const rentalSort = activeSort ?? "start";
  const rentalDirMult = activeSort ? activeDirMult : -1;
  const sortedRentalRowsAll = [...rentalRows].sort((a, b) => {
    switch (rentalSort) {
      case "order_code":
        return rentalDirMult * a.order.order_code.localeCompare(b.order.order_code, "vi");
      case "customer":
        return rentalDirMult * a.customerName.localeCompare(b.customerName, "vi");
      case "start":
        return (
          rentalDirMult * (a.order.rental_start_at ?? "").localeCompare(b.order.rental_start_at ?? "")
        );
      case "end":
        return rentalDirMult * (a.order.rental_end_at ?? "").localeCompare(b.order.rental_end_at ?? "");
      case "quantity":
        return rentalDirMult * (a.line.quantity - b.line.quantity);
      case "revenue":
        return rentalDirMult * (a.line.line_total - b.line.line_total);
      case "status":
        return rentalDirMult * a.statusLabel.localeCompare(b.statusLabel, "vi");
      default:
        return 0;
    }
  });
  // Phân trang thật diễn ra ở đây, sau khi đã sắp xếp toàn bộ dòng theo loại
  // hàng này (xem ghi chú ở chỗ tải rentalLines phía trên).
  const sortedRentalRows = sortedRentalRowsAll.slice(
    (rentalPage - 1) * RENTAL_PAGE_SIZE,
    rentalPage * RENTAL_PAGE_SIZE,
  );

  const priceLine =
    type.product_type === "rental"
      ? `${currencyFormatter.format(type.price)}đ/${RENTAL_PERIOD_UNIT_LABELS[type.rental_period_unit!]}` +
        (type.pricing_method === "pricing_structure"
          ? ` · bảng giá: ${templateNameById.get(type.pricing_template_id ?? "") ?? "—"}`
          : "") +
        (type.deposit_amount > 0 ? ` · cọc: ${currencyFormatter.format(type.deposit_amount)}đ` : "")
      : `${currencyFormatter.format(type.price)}đ`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div className="flex items-start gap-3">
            {type.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={type.image_url} alt="" className="size-14 shrink-0 rounded-lg border object-cover" />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <ImageOff className="size-6" />
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{type.name}</CardTitle>
                <Badge variant="secondary">{PRODUCT_TYPE_LABELS[type.product_type]}</Badge>
                {type.tracking_type && (
                  <Badge variant="outline">{TRACKING_TYPE_LABELS[type.tracking_type]}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{priceLine}</p>
            </div>
          </div>
          {canManageCatalog && (
            <div className="flex items-center gap-1">
              <EquipmentTypeDialog
                templates={templateList}
                equipmentType={type}
                editTriggerVariant="outline"
              />
              <ConfirmDeleteButton
                confirmMessage={`Xoá "${type.name}" và toàn bộ dữ liệu liên quan? Hành động này không thể hoàn tác.`}
                successMessage="Đã xoá."
                action={deleteEquipmentType}
                actionArg={type.id}
              />
            </div>
          )}
        </CardHeader>
      </Card>

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/equipment/${id}?tab=${t.value}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {activeTab === "stock" && (
        <div className="space-y-4">
          {isService && (
            <p className="text-sm text-muted-foreground">Hàng dịch vụ không có tồn kho.</p>
          )}

          {showUnitsBlock &&
            unitList.map((unit) => {
              const unitStock = stockByUnit.get(unit.id) ?? [];
              const unitTags = rfidTagsByUnit.get(unit.id) ?? [];
              return (
                <div key={unit.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {unit.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={unit.image_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md border object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium">
                          {unit.brand_model}
                          {unit.price != null && (
                            <span className="text-muted-foreground ml-2 text-sm font-normal">
                              {currencyFormatter.format(unit.price)}đ
                            </span>
                          )}
                        </p>
                        {unit.condition_notes && (
                          <p className="text-sm text-muted-foreground">{unit.condition_notes}</p>
                        )}
                      </div>
                    </div>
                    {canManageCatalog && (
                      <div className="flex items-center gap-1">
                        <RfidTagDialog
                          label={unit.brand_model}
                          equipmentTypeId={type.id}
                          equipmentUnitId={unit.id}
                          tags={unitTags}
                        />
                        <EquipmentUnitDialog equipmentTypeId={type.id} typePrice={type.price} unit={unit} />
                        <ConfirmDeleteButton
                          confirmMessage={`Xoá biến thể "${unit.brand_model}"?`}
                          successMessage="Đã xoá biến thể."
                          action={deleteEquipmentUnit}
                          actionArg={unit.id}
                        />
                      </div>
                    )}
                  </div>

                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chi nhánh</TableHead>
                        <TableHead>Tổng</TableHead>
                        <TableHead>Trong kho</TableHead>
                        <TableHead>Đang cho thuê</TableHead>
                        {canManageStock && <TableHead className="w-20"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unitStock.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{branchNameById.get(row.branch_id) ?? "—"}</TableCell>
                          <TableCell>{row.quantity_total}</TableCell>
                          <TableCell>{row.quantity_in_stock}</TableCell>
                          <TableCell>{row.quantity_picked_up}</TableCell>
                          {canManageStock && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <EquipmentStockDialog
                                  equipmentUnitId={unit.id}
                                  branches={branchList}
                                  stock={row}
                                />
                                <ConfirmDeleteButton
                                  confirmMessage={`Xoá tồn kho "${unit.brand_model}" tại ${branchNameById.get(row.branch_id) ?? ""}?`}
                                  successMessage="Đã xoá tồn kho."
                                  action={deleteEquipmentStock}
                                  actionArg={row.id}
                                />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {!unitStock.length && (
                        <TableRow>
                          <TableCell
                            colSpan={canManageStock ? 5 : 4}
                            className="text-center text-muted-foreground"
                          >
                            Chưa có tồn kho ở chi nhánh nào.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  {canManageStock && (
                    <div className="mt-2 flex items-center gap-2">
                      <EquipmentStockDialog equipmentUnitId={unit.id} branches={branchList} />
                      <TransferStockDialog equipmentUnitId={unit.id} branches={branchList} />
                      <EquipmentPurchaseDialog equipmentUnitId={unit.id} branches={branchList} />
                      <EquipmentCostAdjustmentDialog
                        equipmentUnitId={unit.id}
                        branchStocks={unitStock
                          .filter((row) => row.quantity_in_stock > 0)
                          .map((row) => ({
                            branch_id: row.branch_id,
                            branch_name: branchNameById.get(row.branch_id) ?? "—",
                            quantity_in_stock: row.quantity_in_stock,
                          }))}
                      />
                      <EquipmentDisposalDialog equipmentUnitId={unit.id} branches={branchList} />
                    </div>
                  )}
                </div>
              );
            })}

          {showUnitsBlock && !unitList.length && (
            <p className="text-center text-sm text-muted-foreground">Chưa có biến thể nào.</p>
          )}

          {showUnitsBlock && canManageCatalog && (
            <EquipmentUnitDialog equipmentTypeId={type.id} typePrice={type.price} />
          )}

          {isRentalIndividual && (
            <>
              {/* Biến thể TUỲ CHỌN cho hàng serialize — không có bảng tồn
                  kho/mua/thanh lý đi kèm như biến thể của hàng quantity, chỉ
                  đơn thuần là nhãn để nhóm các máy có cùng cấu hình bán hàng
                  (VD iPad Wi-Fi vs Wi-Fi+5G). Ẩn hẳn khi chưa ai tạo biến
                  thể nào — đa số loại hàng sẽ không cần tới khối này. */}
              {(unitList.length > 0 || canManageCatalog) && (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Biến thể</p>
                    {canManageCatalog && (
                      <EquipmentUnitDialog equipmentTypeId={type.id} typePrice={type.price} />
                    )}
                  </div>
                  {unitList.length > 0 ? (
                    <ul className="divide-y">
                      {unitList.map((unit) => (
                        <li
                          key={unit.id}
                          className="flex items-center justify-between gap-2 py-1.5 text-sm first:pt-0 last:pb-0"
                        >
                          <span>
                            {unit.brand_model}
                            {unit.price != null && (
                              <span className="text-muted-foreground ml-2">
                                {currencyFormatter.format(unit.price)}đ
                              </span>
                            )}
                          </span>
                          {canManageCatalog && (
                            <div className="flex items-center gap-1">
                              <EquipmentUnitDialog equipmentTypeId={type.id} typePrice={type.price} unit={unit} />
                              <ConfirmDeleteButton
                                confirmMessage={`Xoá biến thể "${unit.brand_model}"?`}
                                successMessage="Đã xoá biến thể."
                                action={deleteEquipmentUnit}
                                actionArg={unit.id}
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Chưa có biến thể nào — loại hàng này chỉ có 1 cấu hình, mỗi máy dưới đây độc
                      lập theo serial riêng.
                    </p>
                  )}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã định danh</TableHead>
                    {unitList.length > 0 && <TableHead>Biến thể</TableHead>}
                    <SortableTableHead sortKey="branch" label="Chi nhánh" />
                    <SortableTableHead sortKey="status" label="Trạng thái" />
                    <TableHead>Ghi chú</TableHead>
                    {canManageStock && <TableHead className="w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstances.map((inst) => {
                    const instTags = rfidTagsByInstance.get(inst.id) ?? [];
                    return (
                      <TableRow key={inst.id}>
                        <TableCell className="font-medium">{inst.identifier_code}</TableCell>
                        {unitList.length > 0 && (
                          <TableCell>
                            {inst.equipment_unit_id
                              ? (unitById.get(inst.equipment_unit_id)?.brand_model ?? "—")
                              : "—"}
                          </TableCell>
                        )}
                        <TableCell>{branchNameById.get(inst.branch_id ?? "") ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={INSTANCE_STATUS_VARIANT[inst.status]}>
                            {EQUIPMENT_INSTANCE_STATUS_LABELS[inst.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{inst.condition_notes ?? "—"}</TableCell>
                        {canManageStock && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <RfidTagDialog
                                label={inst.identifier_code}
                                equipmentTypeId={type.id}
                                equipmentInstanceId={inst.id}
                                tags={instTags}
                              />
                              <EquipmentInstanceDialog
                                equipmentTypeId={type.id}
                                branches={branchList}
                                units={unitList}
                                instance={inst}
                              />
                              {inst.status !== "disposed" && (
                                <EquipmentInstanceDisposeDialog
                                  instanceId={inst.id}
                                  identifierCode={inst.identifier_code}
                                />
                              )}
                              <ConfirmDeleteButton
                                confirmMessage={`Xoá sản phẩm "${inst.identifier_code}"?`}
                                successMessage="Đã xoá sản phẩm."
                                action={deleteEquipmentInstance}
                                actionArg={inst.id}
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {!instances?.length && (
                    <TableRow>
                      <TableCell
                        colSpan={
                          (canManageStock ? 5 : 4) + (unitList.length > 0 ? 1 : 0)
                        }
                        className="text-center text-muted-foreground"
                      >
                        Chưa có sản phẩm nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {canManageStock && (
                <EquipmentInstanceDialog
                  equipmentTypeId={type.id}
                  branches={branchList}
                  units={unitList}
                />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "rentals" && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="order_code" label="Mã đơn" />
                  <SortableTableHead sortKey="customer" label="Khách hàng" />
                  <TableHead>Sản phẩm</TableHead>
                  <SortableTableHead sortKey="start" label="Ngày bắt đầu" />
                  <SortableTableHead sortKey="end" label="Ngày kết thúc" />
                  <SortableTableHead sortKey="quantity" label="Số lượng" />
                  <SortableTableHead sortKey="revenue" label="Doanh thu" />
                  <SortableTableHead sortKey="status" label="Trạng thái" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRentalRows.map(({ line, order, customerName, productLabel, statusLabel }) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">
                      <Link href={`/orders/${order.id}`} className="hover:underline">
                        {order.order_code}
                      </Link>
                    </TableCell>
                    <TableCell>{customerName}</TableCell>
                    <TableCell>{productLabel}</TableCell>
                    <TableCell>
                      {order.rental_start_at ? dateFormatter.format(new Date(order.rental_start_at)) : "—"}
                    </TableCell>
                    <TableCell>
                      {order.rental_end_at ? dateFormatter.format(new Date(order.rental_end_at)) : "—"}
                    </TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>{currencyFormatter.format(line.line_total)}đ</TableCell>
                    <TableCell>{statusLabel}</TableCell>
                  </TableRow>
                ))}
                {!sortedRentalRows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Chưa có lượt thuê nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {activeTab === "rentals" && (
        <PaginationControls
          page={rentalPage}
          totalPages={rentalTotalPages}
          totalCount={rentalTotalCount ?? 0}
          itemLabel="lượt thuê"
        />
      )}

      {activeTab === "history" && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Biến thể</TableHead>
                  <TableHead>Từ</TableHead>
                  <TableHead>Đến</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transfers ?? []).map((t) => {
                  const unit = unitById.get(t.equipment_unit_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>{dateFormatter.format(new Date(t.created_at))}</TableCell>
                      <TableCell>{unit?.brand_model ?? "—"}</TableCell>
                      <TableCell>{branchNameById.get(t.from_branch_id) ?? "—"}</TableCell>
                      <TableCell>{branchNameById.get(t.to_branch_id) ?? "—"}</TableCell>
                      <TableCell>{t.quantity}</TableCell>
                      <TableCell>{t.note ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!transfers?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Chưa có lượt chuyển kho nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
