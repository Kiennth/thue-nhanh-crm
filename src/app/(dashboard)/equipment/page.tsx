import {
  Plus,
  Pencil,
  ArrowLeftRight,
  ListTree,
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
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import {
  deleteEquipmentType,
  deleteEquipmentUnit,
  deleteEquipmentStock,
  deleteEquipmentInstance,
  deletePricingTemplate,
} from "@/lib/actions/equipment";
import {
  EQUIPMENT_INSTANCE_STATUS_LABELS,
  EQUIPMENT_SORT_OPTIONS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
  type EquipmentSort,
} from "@/lib/equipment-labels";
import { EquipmentTypeDialog } from "./equipment-type-dialog";
import { EquipmentUnitDialog } from "./equipment-unit-dialog";
import { EquipmentStockDialog } from "./equipment-stock-dialog";
import { TransferStockDialog } from "./transfer-stock-dialog";
import { EquipmentInstanceDialog } from "./equipment-instance-dialog";
import { EquipmentInstanceDisposeDialog } from "./equipment-instance-dispose-dialog";
import { EquipmentPurchaseDialog } from "./equipment-purchase-dialog";
import { EquipmentDisposalDialog } from "./equipment-disposal-dialog";
import { PricingTemplateDialog } from "./pricing-template-dialog";
import { PricingTemplateTiersDialog } from "./pricing-template-tiers-dialog";
import { EquipmentSortSelect } from "./equipment-sort-select";
import { SearchInput } from "@/components/search-input";
import { RfidTagDialog } from "./rfid-tag-dialog";

const MANAGE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

const INSTANCE_STATUS_VARIANT = {
  available: "default",
  rented: "secondary",
  maintenance: "destructive",
  disposed: "outline",
} as const;

function isEquipmentSort(value: string): value is EquipmentSort {
  return (EQUIPMENT_SORT_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; search?: string }>;
}) {
  const { sort, search } = await searchParams;
  const activeSort: EquipmentSort = sort && isEquipmentSort(sort) ? sort : "name_asc";
  const activeSearch = search?.trim() ?? "";

  const supabase = await createClient();
  let typesQuery = supabase.from("equipment_types").select("*");
  if (activeSearch) {
    typesQuery = typesQuery.ilike("name", `%${activeSearch}%`);
  }
  if (activeSort === "price_desc") {
    typesQuery = typesQuery.order("price", { ascending: false });
  } else if (activeSort === "price_asc") {
    typesQuery = typesQuery.order("price", { ascending: true });
  } else if (activeSort === "updated_desc") {
    typesQuery = typesQuery.order("updated_at", { ascending: false });
  } else if (activeSort === "updated_asc") {
    typesQuery = typesQuery.order("updated_at", { ascending: true });
  } else if (activeSort === "name_desc") {
    typesQuery = typesQuery.order("name", { ascending: false });
  } else {
    typesQuery = typesQuery.order("name", { ascending: true });
  }

  const [
    { data: types },
    { data: units },
    { data: stock },
    { data: instances },
    { data: branches },
    { data: transfers },
    { data: templates },
    { data: tiers },
    { data: rfidTags },
    { data: allTypeNames },
    employee,
  ] = await Promise.all([
    typesQuery,
    supabase.from("equipment_units").select("*").order("brand_model"),
    supabase.from("equipment_stock").select("*"),
    supabase.from("equipment_instances").select("*").order("identifier_code"),
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("equipment_transfers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("pricing_template_tiers").select("*").order("min_duration"),
    supabase.from("rfid_tags").select("id, tag_code, equipment_unit_id, equipment_instance_id"),
    // Không lọc theo search — lịch sử chuyển kho luôn cần tên đúng dù danh
    // sách hàng hoá phía trên đang bị thu hẹp bởi ô tìm kiếm.
    supabase.from("equipment_types").select("id, name"),
    getCurrentEmployee(),
  ]);

  const canManage = !!employee && MANAGE_ROLES.includes(employee.role);
  const branchList = branches ?? [];
  const templateList = templates ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));

  const unitsByType = new Map<string, NonNullable<typeof units>>();
  for (const unit of units ?? []) {
    const list = unitsByType.get(unit.equipment_type_id) ?? [];
    list.push(unit);
    unitsByType.set(unit.equipment_type_id, list);
  }

  const stockByUnit = new Map<string, NonNullable<typeof stock>>();
  for (const row of stock ?? []) {
    const list = stockByUnit.get(row.equipment_unit_id) ?? [];
    list.push(row);
    stockByUnit.set(row.equipment_unit_id, list);
  }

  const instancesByType = new Map<string, NonNullable<typeof instances>>();
  for (const inst of instances ?? []) {
    const list = instancesByType.get(inst.equipment_type_id) ?? [];
    list.push(inst);
    instancesByType.set(inst.equipment_type_id, list);
  }

  const tiersByTemplate = new Map<string, NonNullable<typeof tiers>>();
  for (const tier of tiers ?? []) {
    const list = tiersByTemplate.get(tier.template_id) ?? [];
    list.push(tier);
    tiersByTemplate.set(tier.template_id, list);
  }

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  const typeById = new Map((allTypeNames ?? []).map((t) => [t.id, t]));

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Thiết bị</h1>
        <div className="flex items-center gap-2">
          <SearchInput
            key={activeSearch}
            paramName="search"
            placeholder="Tìm theo tên hàng hoá..."
            value={activeSearch}
          />
          <EquipmentSortSelect value={activeSort} />
          {canManage && (
            <EquipmentTypeDialog
              templates={templateList}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Thêm hàng hoá
                </Button>
              }
            />
          )}
        </div>
      </div>

      {canManage && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Bảng giá mẫu</CardTitle>
            <PricingTemplateDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="size-4" />
                  Thêm bảng giá
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Số bậc giá</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateList.map((template) => {
                  const templateTiers = tiersByTemplate.get(template.id) ?? [];
                  return (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>{templateTiers.length}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <PricingTemplateTiersDialog
                            templateId={template.id}
                            templateName={template.name}
                            tiers={templateTiers}
                            trigger={
                              <Button variant="ghost" size="icon-sm">
                                <ListTree className="size-4" />
                                <span className="sr-only">Quản lý bậc giá</span>
                              </Button>
                            }
                          />
                          <ConfirmDeleteButton
                            confirmMessage={`Xoá bảng giá "${template.name}"?`}
                            successMessage="Đã xoá bảng giá."
                            action={deletePricingTemplate}
                            actionArg={template.id}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!templateList.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Chưa có bảng giá mẫu nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {types?.map((type) => {
          const isRentalQuantity = type.product_type === "rental" && type.tracking_type === "quantity";
          const isRentalIndividual =
            type.product_type === "rental" && type.tracking_type === "individual";
          const isSale = type.product_type === "sale";
          const isService = type.product_type === "service";
          const showUnitsBlock = isRentalQuantity || isSale;

          const typeUnits = showUnitsBlock ? (unitsByType.get(type.id) ?? []) : [];
          const typeInstances = isRentalIndividual ? (instancesByType.get(type.id) ?? []) : [];

          const priceLine =
            type.product_type === "rental"
              ? `${currencyFormatter.format(type.price)}đ/${RENTAL_PERIOD_UNIT_LABELS[type.rental_period_unit!]}` +
                (type.pricing_method === "pricing_structure"
                  ? ` · bảng giá: ${templateNameById.get(type.pricing_template_id ?? "") ?? "—"}`
                  : "") +
                (type.deposit_amount > 0
                  ? ` · cọc: ${currencyFormatter.format(type.deposit_amount)}đ`
                  : "")
              : `${currencyFormatter.format(type.price)}đ`;

          return (
            <Card key={type.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div className="flex items-start gap-3">
                  {type.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={type.image_url}
                      alt=""
                      className="size-12 shrink-0 rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                      <ImageOff className="size-5" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{type.name}</CardTitle>
                      <Badge variant="secondary">{PRODUCT_TYPE_LABELS[type.product_type]}</Badge>
                      {type.tracking_type && (
                        <Badge variant="outline">{TRACKING_TYPE_LABELS[type.tracking_type]}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{priceLine}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <EquipmentTypeDialog
                      templates={templateList}
                      equipmentType={type}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <Pencil className="size-4" />
                          <span className="sr-only">Sửa</span>
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

              {(showUnitsBlock || isRentalIndividual || isService) && (
                <CardContent className="space-y-4">
                  {isService && (
                    <p className="text-sm text-muted-foreground">
                      Hàng dịch vụ không có tồn kho.
                    </p>
                  )}

                  {showUnitsBlock &&
                    typeUnits.map((unit) => {
                      const unitStock = stockByUnit.get(unit.id) ?? [];
                      const unitTags = rfidTagsByUnit.get(unit.id) ?? [];
                      return (
                        <div key={unit.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{unit.brand_model}</p>
                              {unit.condition_notes && (
                                <p className="text-sm text-muted-foreground">
                                  {unit.condition_notes}
                                </p>
                              )}
                            </div>
                            {canManage && (
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
                                <TableHead>Sẵn có</TableHead>
                                {canManage && <TableHead className="w-20"></TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unitStock.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell>
                                    {branchNameById.get(row.branch_id) ?? "—"}
                                  </TableCell>
                                  <TableCell>{row.quantity_total}</TableCell>
                                  <TableCell>{row.quantity_available}</TableCell>
                                  {canManage && (
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
                                    colSpan={canManage ? 4 : 3}
                                    className="text-center text-muted-foreground"
                                  >
                                    Chưa có tồn kho ở chi nhánh nào.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>

                          {canManage && (
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

                  {showUnitsBlock && !typeUnits.length && (
                    <p className="text-center text-sm text-muted-foreground">
                      Chưa có biến thể nào.
                    </p>
                  )}

                  {showUnitsBlock && canManage && (
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
                            {canManage && <TableHead className="w-20"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {typeInstances.map((inst) => {
                            const instTags = rfidTagsByInstance.get(inst.id) ?? [];
                            return (
                            <TableRow key={inst.id}>
                              <TableCell className="font-medium">
                                {inst.identifier_code}
                              </TableCell>
                              <TableCell>
                                {branchNameById.get(inst.branch_id ?? "") ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={INSTANCE_STATUS_VARIANT[inst.status]}>
                                  {EQUIPMENT_INSTANCE_STATUS_LABELS[inst.status]}
                                </Badge>
                              </TableCell>
                              <TableCell>{inst.condition_notes ?? "—"}</TableCell>
                              {canManage && (
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
                                          <span className="sr-only">
                                            Tag RFID ({instTags.length})
                                          </span>
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
                          {!typeInstances.length && (
                            <TableRow>
                              <TableCell
                                colSpan={canManage ? 5 : 4}
                                className="text-center text-muted-foreground"
                              >
                                Chưa có sản phẩm nào.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>

                      {canManage && (
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
                </CardContent>
              )}
            </Card>
          );
        })}
        {!types?.length && (
          <p className="text-center text-muted-foreground">Chưa có hàng hoá nào.</p>
        )}
      </div>

      {!!transfers?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lịch sử chuyển kho gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Từ</TableHead>
                  <TableHead>Đến</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => {
                  const unit = unitById.get(t.equipment_unit_id);
                  const typeName = unit ? typeById.get(unit.equipment_type_id)?.name : undefined;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>{dateFormatter.format(new Date(t.created_at))}</TableCell>
                      <TableCell>
                        {typeName ?? "—"} {unit ? `(${unit.brand_model})` : ""}
                      </TableCell>
                      <TableCell>{branchNameById.get(t.from_branch_id) ?? "—"}</TableCell>
                      <TableCell>{branchNameById.get(t.to_branch_id) ?? "—"}</TableCell>
                      <TableCell>{t.quantity}</TableCell>
                      <TableCell>{t.note ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
