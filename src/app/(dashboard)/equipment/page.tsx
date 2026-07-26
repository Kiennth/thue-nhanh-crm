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
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentEmployee } from "@/lib/dal";
import { deleteEquipmentType, deletePricingTemplate } from "@/lib/actions/equipment";
import { computeEquipmentTypeReports, type OrderLineInput } from "@/lib/equipment-reports";
import {
  PRICING_METHOD_LABELS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
} from "@/lib/equipment-labels";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import type { Database } from "@/types/database";
import { EquipmentTypeDialog } from "./equipment-type-dialog";
import { PricingTemplateDialog } from "./pricing-template-dialog";
import { PricingTemplateTiersDialog } from "./pricing-template-tiers-dialog";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const PAGE_SIZE = 20;
const TOP_N = 10;

type EquipmentTypeRow = Database["public"]["Tables"]["equipment_types"]["Row"];

const SORT_KEYS = ["name", "productType", "trackingType", "pricingMethod", "price", "stock"] as const;
type SortKey = (typeof SORT_KEYS)[number];
function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const { search, page: pageParam, sort, dir } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();
  const employee = await getCurrentEmployee();
  const canManageCatalog = !!employee && MANAGE_ROLES.includes(employee.role);
  const canManageStock = !!employee && EQUIPMENT_WRITE_ROLES.includes(employee.role);

  // Sắp xếp theo Loại/Tồn kho không thể đẩy hết xuống Postgres (Loại là
  // nhãn ghép từ 2 cột, Tồn kho là tổng suy ra từ equipment_units/stock hoặc
  // equipment_instances) — lấy TOÀN BỘ loại hàng khớp tìm kiếm, tính/lọc/sắp/
  // phân trang gộp 1 lần trong JS.
  const allTypes = await fetchAllRows<EquipmentTypeRow>((from, to) => {
    let q = supabase.from("equipment_types").select("*");
    if (activeSearch) q = q.ilike("name", `%${activeSearch}%`);
    return q.range(from, to);
  });

  const { data: templates } = await supabase.from("pricing_templates").select("*").order("name");
  const { data: tiers } = await supabase.from("pricing_template_tiers").select("*").order("min_duration");
  const templateList = templates ?? [];
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));

  const rentalOrSaleTypeIds = allTypes
    .filter((t) => t.product_type === "sale" || (t.product_type === "rental" && t.tracking_type === "quantity"))
    .map((t) => t.id);
  const individualTypeIds = allTypes
    .filter((t) => t.product_type === "rental" && t.tracking_type === "individual")
    .map((t) => t.id);

  const [units, instanceCounts] = await Promise.all([
    rentalOrSaleTypeIds.length
      ? fetchAllRows<{ id: string; equipment_type_id: string }>((from, to) =>
          supabase
            .from("equipment_units")
            .select("id, equipment_type_id")
            .in("equipment_type_id", rentalOrSaleTypeIds)
            .range(from, to),
        )
      : Promise.resolve([]),
    individualTypeIds.length
      ? fetchAllRows<{ id: string; equipment_type_id: string }>((from, to) =>
          supabase
            .from("equipment_instances")
            .select("id, equipment_type_id")
            .in("equipment_type_id", individualTypeIds)
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  const unitIds = units.map((u) => u.id);
  const stock = unitIds.length
    ? await fetchAllRows<{ equipment_unit_id: string; quantity_total: number }>((from, to) =>
        supabase
          .from("equipment_stock")
          .select("equipment_unit_id, quantity_total")
          .in("equipment_unit_id", unitIds)
          .range(from, to),
      )
    : [];

  const unitTypeById = new Map(units.map((u) => [u.id, u.equipment_type_id]));
  const stockTotalByTypeId = new Map<string, number>();
  for (const row of stock) {
    const typeId = unitTypeById.get(row.equipment_unit_id);
    if (!typeId) continue;
    stockTotalByTypeId.set(typeId, (stockTotalByTypeId.get(typeId) ?? 0) + row.quantity_total);
  }
  const instanceCountByTypeId = new Map<string, number>();
  for (const inst of instanceCounts) {
    instanceCountByTypeId.set(inst.equipment_type_id, (instanceCountByTypeId.get(inst.equipment_type_id) ?? 0) + 1);
  }

  function trackingTypeLabel(t: EquipmentTypeRow) {
    return t.tracking_type ? TRACKING_TYPE_LABELS[t.tracking_type] : "—";
  }
  function pricingMethodLabel(t: EquipmentTypeRow) {
    if (!t.pricing_method) return "—";
    if (t.pricing_method === "flat_fee") return PRICING_METHOD_LABELS.flat_fee;
    return templateNameById.get(t.pricing_template_id ?? "") ?? PRICING_METHOD_LABELS.pricing_structure;
  }
  function stockValue(t: EquipmentTypeRow): number {
    if (t.product_type === "service") return -1;
    if (t.product_type === "rental" && t.tracking_type === "individual") {
      return instanceCountByTypeId.get(t.id) ?? 0;
    }
    return stockTotalByTypeId.get(t.id) ?? 0;
  }

  const dirMult = activeDir === "asc" ? 1 : -1;
  const sortedTypes = [...allTypes].sort((a, b) => {
    switch (activeSort) {
      case "productType":
        return dirMult * PRODUCT_TYPE_LABELS[a.product_type].localeCompare(PRODUCT_TYPE_LABELS[b.product_type], "vi");
      case "trackingType":
        return dirMult * trackingTypeLabel(a).localeCompare(trackingTypeLabel(b), "vi");
      case "pricingMethod":
        return dirMult * pricingMethodLabel(a).localeCompare(pricingMethodLabel(b), "vi");
      case "price":
        return dirMult * (a.price - b.price);
      case "stock":
        return dirMult * (stockValue(a) - stockValue(b));
      case "name":
        return dirMult * a.name.localeCompare(b.name, "vi");
      default:
        return a.name.localeCompare(b.name, "vi");
    }
  });

  const safeTotalCount = sortedTypes.length;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const typeList = sortedTypes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------------------------------------------------------------
  // Báo cáo — hiển thị thẳng trên trang, không tách tab riêng: tổng quan
  // gọn gồm top thiết bị doanh thu cao, cho thuê nhiều lần, tỉ suất lợi
  // nhuận cao, và vốn đọng (đã mua nhưng chưa từng cho thuê). KHÔNG liệt
  // kê toàn bộ danh mục — chỉ top 10 mỗi mục.
  // ---------------------------------------------------------------------

  let reportSummary: {
    totalInventoryValue: number;
    totalUnitsInStock: number;
    averageInventoryValue: number;
    topRevenue: { name: string; revenue: number; rentalCount: number }[];
    topRentalCount: { name: string; rentalCount: number; revenue: number }[];
    topProfitRatio: {
      name: string;
      purchaseCost: number;
      revenue: number;
      profit: number;
      profitRatio: number;
    }[];
    deadCapital: { name: string; purchaseCost: number; currentInventoryValue: number }[];
  } | null = null;

  if (canManageCatalog) {
    const [
      { data: reportTypes },
      { data: reportUnits },
      { data: reportInstances },
      { data: purchases },
      { data: disposals },
      { data: reportStock },
      orderLines,
    ] = await Promise.all([
      supabase.from("equipment_types").select("id, name, product_type").order("name"),
      supabase.from("equipment_units").select("id, equipment_type_id"),
      supabase.from("equipment_instances").select("equipment_type_id, purchase_price, disposal_price, status"),
      supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
      supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
      supabase.from("equipment_stock").select("equipment_unit_id, quantity_total"),
      fetchAllRows<OrderLineInput>((from, to) =>
        supabase.from("order_equipment").select("equipment_type_id, line_total").range(from, to),
      ),
    ]);

    const reportTypeList = reportTypes ?? [];
    const reports = computeEquipmentTypeReports(
      reportTypeList,
      reportUnits ?? [],
      reportInstances ?? [],
      purchases ?? [],
      disposals ?? [],
      reportStock ?? [],
      orderLines,
    );
    const reportRows = reportTypeList.map((type) => ({ type, report: reports.get(type.id)! }));

    const totalInventoryValue = reportRows.reduce((sum, r) => sum + r.report.currentInventoryValue, 0);
    const totalUnitsInStock =
      (reportStock ?? []).reduce((sum, s) => sum + s.quantity_total, 0) +
      (reportInstances ?? []).filter((i) => i.status !== "disposed").length;

    reportSummary = {
      totalInventoryValue,
      totalUnitsInStock,
      averageInventoryValue: totalUnitsInStock > 0 ? totalInventoryValue / totalUnitsInStock : 0,
      topRevenue: reportRows
        .filter((r) => r.report.revenue > 0)
        .sort((a, b) => b.report.revenue - a.report.revenue)
        .slice(0, TOP_N)
        .map((r) => ({ name: r.type.name, revenue: r.report.revenue, rentalCount: r.report.rentalCount })),
      topRentalCount: reportRows
        .filter((r) => r.report.rentalCount > 0)
        .sort((a, b) => b.report.rentalCount - a.report.rentalCount)
        .slice(0, TOP_N)
        .map((r) => ({ name: r.type.name, rentalCount: r.report.rentalCount, revenue: r.report.revenue })),
      topProfitRatio: reportRows
        .filter((r) => r.report.profitRatio !== null)
        .sort((a, b) => (b.report.profitRatio ?? 0) - (a.report.profitRatio ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({
          name: r.type.name,
          purchaseCost: r.report.purchaseCost,
          revenue: r.report.revenue,
          profit: r.report.profit,
          profitRatio: r.report.profitRatio ?? 0,
        })),
      deadCapital: reportRows
        .filter((r) => r.report.rentalCount === 0 && r.report.purchaseCost > 0)
        .sort((a, b) => b.report.currentInventoryValue - a.report.currentInventoryValue)
        .slice(0, TOP_N)
        .map((r) => ({
          name: r.type.name,
          purchaseCost: r.report.purchaseCost,
          currentInventoryValue: r.report.currentInventoryValue,
        })),
    };
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

      {reportSummary && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tổng quan tồn kho</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Tổng giá trị tồn kho</p>
                  <p className="text-lg font-medium">
                    {currencyFormatter.format(reportSummary.totalInventoryValue)}đ
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Số thiết bị đang giữ</p>
                  <p className="text-lg font-medium">{reportSummary.totalUnitsInStock}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Giá trị trung bình / thiết bị</p>
                  <p className="text-lg font-medium">
                    {currencyFormatter.format(reportSummary.averageInventoryValue)}đ
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Doanh thu cao nhất</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hàng hoá</TableHead>
                      <TableHead>Doanh thu</TableHead>
                      <TableHead>Số lượt thuê</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportSummary.topRevenue.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{currencyFormatter.format(r.revenue)}đ</TableCell>
                        <TableCell>{r.rentalCount}</TableCell>
                      </TableRow>
                    ))}
                    {!reportSummary.topRevenue.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Chưa có dữ liệu.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cho thuê nhiều lần nhất</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hàng hoá</TableHead>
                      <TableHead>Số lượt thuê</TableHead>
                      <TableHead>Doanh thu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportSummary.topRentalCount.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.rentalCount}</TableCell>
                        <TableCell>{currencyFormatter.format(r.revenue)}đ</TableCell>
                      </TableRow>
                    ))}
                    {!reportSummary.topRentalCount.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Chưa có dữ liệu.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tỉ suất lợi nhuận cao nhất</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Tỉ suất lợi nhuận = (Doanh thu + Thu thanh lý) / Giá vốn — chỉ tính hàng đã có giá
                  vốn (100% = hoà vốn, trên 100% = đã có lãi).
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hàng hoá</TableHead>
                      <TableHead>Giá vốn</TableHead>
                      <TableHead>Lợi nhuận</TableHead>
                      <TableHead>Tỉ suất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportSummary.topProfitRatio.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{currencyFormatter.format(r.purchaseCost)}đ</TableCell>
                        <TableCell className={r.profit < 0 ? "text-destructive" : ""}>
                          {currencyFormatter.format(r.profit)}đ
                        </TableCell>
                        <TableCell>{(r.profitRatio * 100).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                    {!reportSummary.topProfitRatio.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Chưa có dữ liệu.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vốn đọng — đã mua nhưng chưa từng cho thuê</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hàng hoá</TableHead>
                      <TableHead>Giá vốn</TableHead>
                      <TableHead>Giá trị tồn kho</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportSummary.deadCapital.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{currencyFormatter.format(r.purchaseCost)}đ</TableCell>
                        <TableCell>{currencyFormatter.format(r.currentInventoryValue)}đ</TableCell>
                      </TableRow>
                    ))}
                    {!reportSummary.deadCapital.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Không có hàng nào đọng vốn.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
                <SortableTableHead sortKey="name" label="Tên hàng hoá" />
                <SortableTableHead sortKey="productType" label="Loại hàng hoá" />
                <SortableTableHead sortKey="trackingType" label="Kiểu theo dõi tồn kho" />
                <SortableTableHead sortKey="pricingMethod" label="Cách tính giá" />
                <SortableTableHead sortKey="price" label="Giá" />
                <SortableTableHead sortKey="stock" label="Tồn kho" />
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeList.map((type) => {
                const priceLine =
                  type.product_type === "rental"
                    ? `${currencyFormatter.format(type.price)}đ/${RENTAL_PERIOD_UNIT_LABELS[type.rental_period_unit!]}`
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
                      <Badge variant="secondary">{PRODUCT_TYPE_LABELS[type.product_type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{trackingTypeLabel(type)}</TableCell>
                    <TableCell className="text-muted-foreground">{pricingMethodLabel(type)}</TableCell>
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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
