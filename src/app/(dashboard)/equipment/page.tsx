import Link from "next/link";
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
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { PaginationControls } from "@/components/pagination-controls";
import { SearchInput } from "@/components/search-input";
import { SortableTableHead } from "@/components/sortable-table-head";
import { ProductHighlightCards } from "@/components/dashboard-cards";
import { RevenueBarList, type RevenuePoint } from "@/components/revenue-bar-list";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentEmployee } from "@/lib/dal";
import { deleteEquipmentType } from "@/lib/actions/equipment";
import { computeEquipmentTypeReports, type OrderLineInput } from "@/lib/equipment-reports";
import { computeEquipmentValueOverview } from "@/lib/equipment-value-overview";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import {
  PRICING_METHOD_LABELS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
} from "@/lib/equipment-labels";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import type { Database } from "@/types/database";
import { EquipmentTypeDialog } from "./equipment-type-dialog";
import { EquipmentValueTrendChart } from "./equipment-value-trend-chart";
import { OrderDateRangeFilter } from "../orders/order-date-range-filter";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const PAGE_SIZE = 20;
const TOP_N = 10;

type EquipmentTypeRow = Database["public"]["Tables"]["equipment_types"]["Row"];

const SORT_KEYS = [
  "name",
  "productType",
  "trackingType",
  "pricingMethod",
  "price",
  "stock",
  "stockValue",
] as const;
type SortKey = (typeof SORT_KEYS)[number];
function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

// Báo cáo thiết bị chỉ nhìn lại quá khứ (doanh thu/lượt thuê đã phát sinh) —
// không có "tuần tới"/"tháng tới" như bộ lọc đơn hàng sắp giao/sắp thu hồi.
const EQUIPMENT_REPORT_RANGE_VALUES = [
  "all",
  "today",
  "yesterday",
  "last_7_days",
  "last_week",
  "last_month",
  "last_year",
  "custom",
] as const satisfies readonly DateRangePreset[];

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    page?: string;
    sort?: string;
    dir?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { search, page: pageParam, sort, dir, range, from: rangeFrom, to: rangeTo } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "all";
  const reportDateRange = computeDateRange(activeRange, new Date(), { from: rangeFrom, to: rangeTo });

  const supabase = await createClient();
  const employee = await getCurrentEmployee();
  const canManageCatalog = !!employee && MANAGE_ROLES.includes(employee.role);
  const canManageStock = !!employee && EQUIPMENT_WRITE_ROLES.includes(employee.role);
  // Xu hướng giá trị thiết bị: Giám đốc/Admin/Kế toán xem toàn hệ thống,
  // Cửa hàng trưởng xem đúng chi nhánh mình quản lý — rộng hơn phần "Báo cáo"
  // bên dưới (chỉ MANAGE_ROLES), vì CEO yêu cầu Cửa hàng trưởng cũng thấy.
  const canViewInventoryTrend = canManageCatalog || employee?.role === "cua_hang_truong";
  const equipmentValueOverview = canViewInventoryTrend
    ? await computeEquipmentValueOverview(canManageCatalog ? null : employee!.branch_id)
    : null;

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

  // Giá trị tồn kho = giá VỐN mua vào (bình quân gia quyền) x số lượng còn
  // giữ — KHÔNG phải giá thuê x số lượng (giá thuê là doanh thu tiềm năng,
  // không phải giá trị tài sản đang có). Tính 1 lần cho TOÀN BỘ danh mục —
  // dùng cho cả cột trong bảng (mọi vai trò đều thấy) lẫn phần "Báo cáo" bên
  // dưới (chỉ MANAGE_ROLES).
  const [
    { data: reportTypes },
    { data: reportUnits },
    { data: reportInstances },
    { data: purchases },
    { data: disposals },
    { data: reportStock },
    allOrderLines,
  ] = await Promise.all([
    supabase.from("equipment_types").select("id, name, product_type").order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase.from("equipment_instances").select("equipment_type_id, purchase_price, disposal_price, status"),
    supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
    supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
    supabase.from("equipment_stock").select("equipment_unit_id, quantity_total"),
    fetchAllRows<OrderLineInput & { order_id: string }>((from, to) =>
      supabase.from("order_equipment").select("equipment_type_id, line_total, order_id").range(from, to),
    ),
  ]);
  const reportTypeList = reportTypes ?? [];
  const baseReports = computeEquipmentTypeReports(
    reportTypeList,
    reportUnits ?? [],
    reportInstances ?? [],
    purchases ?? [],
    disposals ?? [],
    reportStock ?? [],
    allOrderLines,
  );
  const inventoryValueByTypeId = new Map(
    reportTypeList.map((t) => [t.id, baseReports.get(t.id)?.currentInventoryValue ?? 0]),
  );

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
      case "stockValue":
        return dirMult * ((inventoryValueByTypeId.get(a.id) ?? 0) - (inventoryValueByTypeId.get(b.id) ?? 0));
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
    topRevenue: RevenuePoint[];
    topRentalCount: RevenuePoint[];
    topProfitRatio: RevenuePoint[];
    topInventoryValue: RevenuePoint[];
  } | null = null;

  if (canManageCatalog) {
    // Doanh thu/số lượt thuê/tỉ suất lợi nhuận lọc theo ngày đặt đơn (order_date)
    // khi có chọn khoảng thời gian — order_equipment không có cột ngày riêng
    // nên phải lấy trước tập order_id khớp khoảng ngày rồi lọc theo đó. Giá
    // trị tồn kho (currentInventoryValue) KHÔNG phụ thuộc đơn hàng nên luôn
    // dùng lại baseReports (đã tính sẵn ở trên) — chỉ tính lại reports khi
    // thật sự có bộ lọc thời gian, tránh tính 2 lần không cần thiết.
    const reports = reportDateRange
      ? await (async () => {
          const ordersInRange = await fetchAllRows<{ id: string }>((from, to) =>
            supabase
              .from("orders")
              .select("id")
              .gte("order_date", reportDateRange.start)
              .lte("order_date", reportDateRange.end)
              .range(from, to),
          );
          const orderIdsInRange = new Set(ordersInRange.map((o) => o.id));
          const filteredOrderLines = allOrderLines.filter((l) => orderIdsInRange.has(l.order_id));
          return computeEquipmentTypeReports(
            reportTypeList,
            reportUnits ?? [],
            reportInstances ?? [],
            purchases ?? [],
            disposals ?? [],
            reportStock ?? [],
            filteredOrderLines,
          );
        })()
      : baseReports;
    const reportRows = reportTypeList.map((type) => ({ type, report: reports.get(type.id)! }));

    const totalInventoryValue = reportRows.reduce((sum, r) => sum + r.report.currentInventoryValue, 0);
    const totalUnitsInStock =
      (reportStock ?? []).reduce((sum, s) => sum + s.quantity_total, 0) +
      (reportInstances ?? []).filter((i) => i.status !== "disposed").length;

    reportSummary = {
      totalInventoryValue,
      totalUnitsInStock,
      averageInventoryValue: totalUnitsInStock > 0 ? totalInventoryValue / totalUnitsInStock : 0,
      // Chỉ tính hàng cho thuê thật — bỏ dịch vụ phụ phát sinh (phí giao/thu
      // hồi bằng xe máy/ô tô, hỗ trợ kỹ thuật...) vì không phản ánh sản phẩm
      // công ty cho thuê.
      topRevenue: reportRows
        .filter((r) => r.type.product_type === "rental" && r.report.revenue > 0)
        .sort((a, b) => b.report.revenue - a.report.revenue)
        .slice(0, 5)
        .map((r) => ({ label: r.type.name, value: r.report.revenue })),
      topRentalCount: reportRows
        .filter((r) => r.type.product_type === "rental" && r.report.rentalCount > 0)
        .sort((a, b) => b.report.rentalCount - a.report.rentalCount)
        .slice(0, 5)
        .map((r) => ({ label: r.type.name, value: r.report.rentalCount })),
      topProfitRatio: reportRows
        .filter((r) => r.type.product_type === "rental" && r.report.profitRatio !== null)
        .sort((a, b) => (b.report.profitRatio ?? 0) - (a.report.profitRatio ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: (r.report.profitRatio ?? 0) * 100 })),
      topInventoryValue: reportRows
        .filter((r) => r.report.currentInventoryValue > 0)
        .sort((a, b) => b.report.currentInventoryValue - a.report.currentInventoryValue)
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: r.report.currentInventoryValue })),
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
          {canManageCatalog && <EquipmentTypeDialog templates={templateList} />}
        </div>
      </div>

      {equipmentValueOverview && <EquipmentValueTrendChart trend={equipmentValueOverview.trend} />}

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

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Báo cáo</h2>
            <OrderDateRangeFilter
              preset={activeRange}
              from={rangeFrom ?? ""}
              to={rangeTo ?? ""}
              values={EQUIPMENT_REPORT_RANGE_VALUES}
            />
          </div>

          <ProductHighlightCards
            mostRented={reportSummary.topRentalCount}
            flagship={reportSummary.topRevenue}
            topMargin={reportSummary.topProfitRatio}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Giá trị tồn kho lớn nhất</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueBarList points={reportSummary.topInventoryValue} labelWidthClassName="w-32" />
            </CardContent>
          </Card>
        </div>
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
            <SortableTableHead sortKey="stockValue" label="Tổng giá trị tồn kho" />
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

            const stockValueDisplay =
              type.product_type === "service"
                ? "—"
                : `${currencyFormatter.format(inventoryValueByTypeId.get(type.id) ?? 0)}đ`;

            return (
              <ClickableTableRow key={type.id} href={`/equipment/${type.id}`}>
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
                <TableCell>{stockValueDisplay}</TableCell>
                <TableCell>
                  {(canManageCatalog || canManageStock) && (
                    <div className="flex items-center gap-1">
                      {canManageCatalog && (
                        <EquipmentTypeDialog templates={templateList} equipmentType={type} />
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
              </ClickableTableRow>
            );
          })}
          {!typeList.length && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
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
