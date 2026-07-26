import Link from "next/link";
import { Plus, Pencil, ImageOff, ListTree } from "lucide-react";
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
import { PaginationControls } from "@/components/pagination-controls";
import { SearchInput } from "@/components/search-input";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import { deleteEquipmentType, deletePricingTemplate } from "@/lib/actions/equipment";
import {
  EQUIPMENT_SORT_OPTIONS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
  type EquipmentSort,
} from "@/lib/equipment-labels";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { EquipmentTypeDialog } from "./equipment-type-dialog";
import { EquipmentSortSelect } from "./equipment-sort-select";
import { PricingTemplateDialog } from "./pricing-template-dialog";
import { PricingTemplateTiersDialog } from "./pricing-template-tiers-dialog";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const PAGE_SIZE = 20;

function isEquipmentSort(value: string): value is EquipmentSort {
  return (EQUIPMENT_SORT_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; search?: string; page?: string }>;
}) {
  const { sort, search, page: pageParam } = await searchParams;
  const activeSort: EquipmentSort = sort && isEquipmentSort(sort) ? sort : "name_asc";
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  function baseTypesQuery() {
    let q = supabase.from("equipment_types").select("*", { count: "exact" });
    if (activeSearch) q = q.ilike("name", `%${activeSearch}%`);
    return q;
  }

  const { count: totalCount } = await baseTypesQuery();
  const safeTotalCount = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let typesQuery = baseTypesQuery();
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

  const [{ data: types }, { data: templates }, { data: tiers }, employee] = await Promise.all([
    typesQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("pricing_template_tiers").select("*").order("min_duration"),
    getCurrentEmployee(),
  ]);

  const canManageCatalog = !!employee && MANAGE_ROLES.includes(employee.role);
  const canManageStock = !!employee && EQUIPMENT_WRITE_ROLES.includes(employee.role);
  const templateList = templates ?? [];
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));
  const typeList = types ?? [];

  // Tồn kho tổng chỉ để hiển thị tóm tắt ở bảng danh sách — chỉ tra cứu cho
  // đúng trang đang hiển thị (không phải toàn bộ 500+ loại hàng), scoped
  // theo equipment_type_id của các dòng trên trang này.
  const rentalOrSaleTypeIds = typeList
    .filter((t) => t.product_type === "sale" || (t.product_type === "rental" && t.tracking_type === "quantity"))
    .map((t) => t.id);
  const individualTypeIds = typeList
    .filter((t) => t.product_type === "rental" && t.tracking_type === "individual")
    .map((t) => t.id);

  const [{ data: units }, { data: instanceCounts }] = await Promise.all([
    rentalOrSaleTypeIds.length
      ? supabase
          .from("equipment_units")
          .select("id, equipment_type_id")
          .in("equipment_type_id", rentalOrSaleTypeIds)
      : Promise.resolve({ data: [] as { id: string; equipment_type_id: string }[] }),
    individualTypeIds.length
      ? supabase
          .from("equipment_instances")
          .select("id, equipment_type_id")
          .in("equipment_type_id", individualTypeIds)
      : Promise.resolve({ data: [] as { id: string; equipment_type_id: string }[] }),
  ]);
  const unitIds = (units ?? []).map((u) => u.id);
  const { data: stock } = unitIds.length
    ? await supabase.from("equipment_stock").select("equipment_unit_id, quantity_total").in("equipment_unit_id", unitIds)
    : { data: [] as { equipment_unit_id: string; quantity_total: number }[] };

  const unitTypeById = new Map((units ?? []).map((u) => [u.id, u.equipment_type_id]));
  const stockTotalByTypeId = new Map<string, number>();
  for (const row of stock ?? []) {
    const typeId = unitTypeById.get(row.equipment_unit_id);
    if (!typeId) continue;
    stockTotalByTypeId.set(typeId, (stockTotalByTypeId.get(typeId) ?? 0) + row.quantity_total);
  }
  const instanceCountByTypeId = new Map<string, number>();
  for (const inst of instanceCounts ?? []) {
    instanceCountByTypeId.set(inst.equipment_type_id, (instanceCountByTypeId.get(inst.equipment_type_id) ?? 0) + 1);
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
            resetParams={["page"]}
          />
          <EquipmentSortSelect value={activeSort} />
          {canManageCatalog && (
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

      {canManageCatalog && (
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
                  const templateTiers = (tiers ?? []).filter((t) => t.template_id === template.id);
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên hàng hoá</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead>Giá</TableHead>
            <TableHead>Tồn kho</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {typeList.map((type) => {
            const priceLine =
              type.product_type === "rental"
                ? `${currencyFormatter.format(type.price)}đ/${RENTAL_PERIOD_UNIT_LABELS[type.rental_period_unit!]}` +
                  (type.pricing_method === "pricing_structure"
                    ? ` · ${templateNameById.get(type.pricing_template_id ?? "") ?? "—"}`
                    : "")
                : `${currencyFormatter.format(type.price)}đ`;

            const stockDisplay =
              type.product_type === "service"
                ? "—"
                : type.tracking_type === "individual"
                  ? `${instanceCountByTypeId.get(type.id) ?? 0} sản phẩm`
                  : `${stockTotalByTypeId.get(type.id) ?? 0}`;

            return (
              <TableRow key={type.id}>
                <TableCell className="font-medium">
                  <Link href={`/equipment/${type.id}`} className="flex items-center gap-3 hover:underline">
                    {type.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={type.image_url}
                        alt=""
                        className="size-9 shrink-0 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                    {type.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{PRODUCT_TYPE_LABELS[type.product_type]}</Badge>
                    {type.tracking_type && (
                      <Badge variant="outline">{TRACKING_TYPE_LABELS[type.tracking_type]}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{priceLine}</TableCell>
                <TableCell>{stockDisplay}</TableCell>
                <TableCell>
                  {(canManageCatalog || canManageStock) && (
                    <div className="flex items-center gap-1">
                      {canManageCatalog && (
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
                      )}
                      {canManageCatalog && (
                        <ConfirmDeleteButton
                          confirmMessage={`Xoá "${type.name}" và toàn bộ dữ liệu liên quan? Hành động này không thể hoàn tác.`}
                          successMessage="Đã xoá."
                          action={deleteEquipmentType}
                          actionArg={type.id}
                        />
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {!typeList.length && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {activeSearch ? "Không tìm thấy hàng hoá nào." : "Chưa có hàng hoá nào."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PaginationControls page={page} totalPages={totalPages} totalCount={safeTotalCount} itemLabel="loại hàng hoá" />
    </div>
  );
}
