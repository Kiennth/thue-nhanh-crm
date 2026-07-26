import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Plus,
  Pencil,
  ArrowLeftRight,
  ShoppingCart,
  Banknote,
  Radio,
  ImageOff,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
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
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { EquipmentTypeDialog } from "../equipment-type-dialog";
import { EquipmentUnitDialog } from "../equipment-unit-dialog";
import { EquipmentStockDialog } from "../equipment-stock-dialog";
import { TransferStockDialog } from "../transfer-stock-dialog";
import { EquipmentInstanceDialog } from "../equipment-instance-dialog";
import { EquipmentInstanceDisposeDialog } from "../equipment-instance-dispose-dialog";
import { EquipmentPurchaseDialog } from "../equipment-purchase-dialog";
import { EquipmentDisposalDialog } from "../equipment-disposal-dialog";
import { RfidTagDialog } from "../rfid-tag-dialog";
import type { Database } from "@/types/database";

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
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

const INSTANCE_STATUS_VARIANT = {
  available: "default",
  rented: "secondary",
  maintenance: "destructive",
  disposed: "outline",
} as const;

const TABS = [
  { value: "stock", label: "Tồn kho" },
  { value: "history", label: "Lịch sử chuyển kho" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: Tab = tab === "history" ? "history" : "stock";

  const supabase = await createClient();

  const [{ data: type }, { data: templates }, { data: branches }, employee] = await Promise.all([
    supabase.from("equipment_types").select("*").eq("id", id).maybeSingle(),
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("branches").select("id, name").order("name"),
    getCurrentEmployee(),
  ]);
  if (!type) notFound();

  const isRentalQuantity = type.product_type === "rental" && type.tracking_type === "quantity";
  const isRentalIndividual = type.product_type === "rental" && type.tracking_type === "individual";
  const isSale = type.product_type === "sale";
  const isService = type.product_type === "service";
  const showUnitsBlock = isRentalQuantity || isSale;

  const [{ data: units }, { data: instances }] = await Promise.all([
    showUnitsBlock
      ? supabase.from("equipment_units").select("*").eq("equipment_type_id", id).order("brand_model")
      : Promise.resolve({ data: [] as EquipmentUnitRow[] }),
    isRentalIndividual
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

  const employeeChecked = employee;
  const canManageCatalog = !!employeeChecked && MANAGE_ROLES.includes(employeeChecked.role);
  const canManageStock = !!employeeChecked && EQUIPMENT_WRITE_ROLES.includes(employeeChecked.role);
  const branchList = branches ?? [];
  const templateList = templates ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));

  const stockByUnit = new Map<string, NonNullable<typeof stock>>();
  for (const row of stock ?? []) {
    const list = stockByUnit.get(row.equipment_unit_id) ?? [];
    list.push(row);
    stockByUnit.set(row.equipment_unit_id, list);
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
                trigger={
                  <Button variant="outline" size="sm">
                    <Pencil className="size-4" />
                    Sửa
                  </Button>
                }
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
                    <div>
                      <p className="font-medium">{unit.brand_model}</p>
                      {unit.condition_notes && (
                        <p className="text-sm text-muted-foreground">{unit.condition_notes}</p>
                      )}
                    </div>
                    {canManageCatalog && (
                      <div className="flex items-center gap-1">
                        <RfidTagDialog
                          label={unit.brand_model}
                          equipmentTypeId={type.id}
                          equipmentUnitId={unit.id}
                          tags={unitTags}
                          trigger={
                            <Button variant="ghost" size="icon-sm">
                              <Radio className="size-4" />
                              <span className="sr-only">Tag RFID ({unitTags.length})</span>
                            </Button>
                          }
                        />
                        <EquipmentUnitDialog
                          equipmentTypeId={type.id}
                          unit={unit}
                          trigger={
                            <Button variant="ghost" size="icon-sm">
                              <Pencil className="size-4" />
                              <span className="sr-only">Sửa</span>
                            </Button>
                          }
                        />
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
                        <TableHead>Ở khách</TableHead>
                        <TableHead>Bảo trì</TableHead>
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
                          <TableCell>{row.quantity_downtime}</TableCell>
                          {canManageStock && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <EquipmentStockDialog
                                  equipmentUnitId={unit.id}
                                  branches={branchList}
                                  stock={row}
                                  trigger={
                                    <Button variant="ghost" size="icon-sm">
                                      <Pencil className="size-4" />
                                      <span className="sr-only">Sửa</span>
                                    </Button>
                                  }
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
                            colSpan={canManageStock ? 6 : 5}
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
                      <EquipmentStockDialog
                        equipmentUnitId={unit.id}
                        branches={branchList}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Plus className="size-4" />
                            Thêm tồn kho
                          </Button>
                        }
                      />
                      <TransferStockDialog
                        equipmentUnitId={unit.id}
                        branches={branchList}
                        trigger={
                          <Button variant="outline" size="sm">
                            <ArrowLeftRight className="size-4" />
                            Chuyển kho
                          </Button>
                        }
                      />
                      <EquipmentPurchaseDialog
                        equipmentUnitId={unit.id}
                        branches={branchList}
                        trigger={
                          <Button variant="outline" size="sm">
                            <ShoppingCart className="size-4" />
                            Mua hàng
                          </Button>
                        }
                      />
                      <EquipmentDisposalDialog
                        equipmentUnitId={unit.id}
                        branches={branchList}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Banknote className="size-4" />
                            Bán/thanh lý
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}

          {showUnitsBlock && !unitList.length && (
            <p className="text-center text-sm text-muted-foreground">Chưa có biến thể nào.</p>
          )}

          {showUnitsBlock && canManageCatalog && (
            <EquipmentUnitDialog
              equipmentTypeId={type.id}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="size-4" />
                  Thêm biến thể
                </Button>
              }
            />
          )}

          {isRentalIndividual && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã định danh</TableHead>
                    <TableHead>Chi nhánh</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    {canManageStock && <TableHead className="w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(instances ?? []).map((inst) => {
                    const instTags = rfidTagsByInstance.get(inst.id) ?? [];
                    return (
                      <TableRow key={inst.id}>
                        <TableCell className="font-medium">{inst.identifier_code}</TableCell>
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
                                trigger={
                                  <Button variant="ghost" size="icon-sm">
                                    <Radio className="size-4" />
                                    <span className="sr-only">Tag RFID ({instTags.length})</span>
                                  </Button>
                                }
                              />
                              <EquipmentInstanceDialog
                                equipmentTypeId={type.id}
                                branches={branchList}
                                instance={inst}
                                trigger={
                                  <Button variant="ghost" size="icon-sm">
                                    <Pencil className="size-4" />
                                    <span className="sr-only">Sửa</span>
                                  </Button>
                                }
                              />
                              {inst.status !== "disposed" && (
                                <EquipmentInstanceDisposeDialog
                                  instanceId={inst.id}
                                  identifierCode={inst.identifier_code}
                                  trigger={
                                    <Button variant="ghost" size="icon-sm">
                                      <Banknote className="size-4" />
                                      <span className="sr-only">Thanh lý</span>
                                    </Button>
                                  }
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
                      <TableCell colSpan={canManageStock ? 5 : 4} className="text-center text-muted-foreground">
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
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus className="size-4" />
                      Thêm sản phẩm
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>
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
