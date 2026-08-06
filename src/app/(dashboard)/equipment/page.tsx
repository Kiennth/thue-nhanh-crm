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
import { computeEquipmentValueOverview } from "@/lib/equipment-value-overview";
import { vnNow } from "@/lib/vn-time";
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
import { EquipmentCategoryFilter } from "./equipment-category-filter";
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
  "this_year",
  "last_year",
  "custom",
] as const satisfies readonly DateRangePreset[];

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    sort?: string;
    dir?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const {
    search,
    category,
    page: pageParam,
    sort,
    dir,
    range,
    from: rangeFrom,
    to: rangeTo,
  } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const activeCategory = category?.trim() || null;
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  // Mặc định "Năm nay" thay vì "Tất cả thời gian" — khối "Báo cáo" bên dưới
  // trước đây LUÔN quét nguyên bảng order_equipment (30k+ dòng, ~14s) dù
  // chưa ai chọn kỳ nào, vì "Tất cả thời gian" là mặc định. "Tất cả thời
  // gian" vẫn chọn được (giữ nguyên ý nghĩa "sản phẩm chủ lực từ trước đến
  // giờ"), chỉ không còn là mặc định — CEO chốt 2026-08-06.
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "this_year";
  const reportDateRange = computeDateRange(activeRange, vnNow(), { from: rangeFrom, to: rangeTo });

  const supabase = await createClient();
  const employee = await getCurrentEmployee();
  const canManageCatalog = !!employee && MANAGE_ROLES.includes(employee.role);
  const canManageStock = !!employee && EQUIPMENT_WRITE_ROLES.includes(employee.role);
  // Admin VẪN quản trị danh mục (thêm/sửa/xoá hàng hoá, tồn kho) nhưng không
  // xem bức tranh tài sản của công ty: giá trị thiết bị theo thời gian, tổng
  // quan tồn kho, xếp hạng sản phẩm — CEO chốt 2026-08-01.
  const canViewEquipmentReports = canManageCatalog && employee?.role !== "admin";
  // Xu hướng giá trị thiết bị + tổng quan tồn kho: Giám đốc/Kế toán xem toàn
  // hệ thống, Cửa hàng trưởng xem đúng kho mình quản lý.
  const canViewInventoryTrend = canViewEquipmentReports || employee?.role === "cua_hang_truong";
  // Xếp hạng sản phẩm (cho thuê nhiều nhất / chủ lực / tỉ suất lợi nhuận) là
  // thông tin điều hành danh mục — Cửa hàng trưởng và Admin không cần biết.
  const canViewProductHighlights = canViewEquipmentReports;

  // Trước đây trang này fetch theo 3 CHẶNG TUẦN TỰ (giá trị tồn kho đứng một
  // mình → allTypes đứng một mình → units/instances/stock → rồi mới tới khối
  // báo cáo) — mỗi chặng chờ chặng trước xong mới bắt đầu, cộng dồn lại là
  // trang chậm nhất hệ thống (~15s). Không truy vấn nào trong số này phụ
  // thuộc kết quả của truy vấn khác nên gộp hết vào 1 Promise.all — thời
  // gian chờ giờ bằng đúng truy vấn CHẬM NHẤT thay vì tổng của cả nhiều
  // chặng.
  //
  // Doanh thu/lượt thuê/tồn kho/giá trị tồn kho từng loại hàng giờ tính 1
  // lần DUY NHẤT trong Postgres qua RPC equipment_page_report (migration
  // 20260806100000) — thay cho việc kéo order_equipment (30k+ dòng, ~14s) +
  // equipment_units/instances/purchases/disposals/stock thô về JS rồi cộng
  // dồn (computeEquipmentTypeReports cũ, đã xoá). p_branch_id luôn truyền
  // null vì trang này không có ô chọn chi nhánh — hàm tự ép về đúng
  // branch_id của người gọi nếu không phải vai trò quản lý (khớp đúng
  // "Giám đốc/Admin/Kế toán cộng gộp toàn hệ thống, còn lại chỉ đúng chi
  // nhánh mình" của bản JS cũ). p_start/p_end null = "Tất cả thời gian";
  // tồn kho/giá trị tồn kho LUÔN là số hiện tại bất kể 2 tham số này (không
  // đụng order_equipment trong hàm SQL) — chỉ doanh thu/lượt thuê mới theo kỳ.
  const [
    allTypes,
    { data: templates },
    { data: categories },
    equipmentValueOverview,
    { data: reportTypes },
    { data: reportRowsRaw },
  ] = await Promise.all([
    // Sắp xếp theo Loại/Tồn kho không thể đẩy hết xuống Postgres (Loại là
    // nhãn ghép từ 2 cột, Tồn kho lấy từ reportByTypeId) — lấy TOÀN BỘ loại
    // hàng khớp tìm kiếm, tính/lọc/sắp/phân trang gộp 1 lần trong JS.
    fetchAllRows<EquipmentTypeRow>((from, to) => {
      let q = supabase.from("equipment_types").select("*");
      if (activeSearch) q = q.ilike("name", `%${activeSearch}%`);
      if (activeCategory) q = q.eq("category_id", activeCategory);
      return q.range(from, to);
    }),
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("equipment_categories").select("id, name").eq("is_active", true).order("sort_order"),
    canViewInventoryTrend
      ? computeEquipmentValueOverview(canManageCatalog ? null : employee!.branch_id)
      : Promise.resolve(null),
    // Tên/loại hàng cho khối "Báo cáo" — TOÀN BỘ danh mục, không bị giới hạn
    // bởi bộ lọc tìm kiếm/danh mục đang áp cho bảng chính.
    supabase.from("equipment_types").select("id, name, product_type").order("name"),
    supabase.rpc("equipment_page_report", {
      p_branch_id: null,
      p_start: reportDateRange?.start ?? null,
      p_end: reportDateRange?.end ?? null,
    }),
  ]);

  const reportByTypeId = new Map(
    (reportRowsRaw ?? []).map((r) => [r.equipment_type_id, r] as const),
  );

  const templateList = templates ?? [];
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));
  const categoryList = categories ?? [];
  const categoryNameById = new Map(categoryList.map((c) => [c.id, c.name]));

  function trackingTypeLabel(t: EquipmentTypeRow) {
    return t.tracking_type ? TRACKING_TYPE_LABELS[t.tracking_type] : "—";
  }
  function pricingMethodLabel(t: EquipmentTypeRow) {
    if (!t.pricing_method) return "—";
    if (t.pricing_method === "flat_fee") return PRICING_METHOD_LABELS.flat_fee;
    return templateNameById.get(t.pricing_template_id ?? "") ?? PRICING_METHOD_LABELS.pricing_structure;
  }

  const reportTypeList = reportTypes ?? [];
  // Cột "Tồn kho"/"Tổng giá trị tồn kho" (bảng chính, mọi vai trò đều thấy)
  // lấy thẳng từ reportByTypeId — RPC luôn trả về số HIỆN TẠI bất kể
  // p_start/p_end đang truyền gì (xem comment ở lời gọi rpc phía trên).
  const inventoryValueByTypeId = new Map(
    reportTypeList.map((t) => [t.id, reportByTypeId.get(t.id)?.current_inventory_value ?? 0]),
  );
  // Cột "Tồn kho" — dịch vụ không có khái niệm tồn kho (-1 = ẩn cột).
  function stockValue(t: EquipmentTypeRow): number {
    if (t.product_type === "service") return -1;
    return reportByTypeId.get(t.id)?.current_stock_qty ?? 0;
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

  // Cửa hàng trưởng cũng xem được báo cáo này, nhưng mọi số liệu bên trong
  // đã bị lọc sẵn về đúng kho/đơn hàng chi nhánh mình (RPC tự ép branch_id
  // — xem comment ở lời gọi rpc phía trên).
  if (canViewInventoryTrend) {
    const reportRows = reportTypeList.map((type) => ({
      type,
      report: reportByTypeId.get(type.id)!,
    }));

    const totalInventoryValue = reportRows.reduce((sum, r) => sum + (r.report?.current_inventory_value ?? 0), 0);
    const totalUnitsInStock = reportRows.reduce((sum, r) => sum + (r.report?.current_stock_qty ?? 0), 0);

    reportSummary = {
      totalInventoryValue,
      totalUnitsInStock,
      averageInventoryValue: totalUnitsInStock > 0 ? totalInventoryValue / totalUnitsInStock : 0,
      // Chỉ tính hàng cho thuê thật — bỏ dịch vụ phụ phát sinh (phí giao/thu
      // hồi bằng xe máy/ô tô, hỗ trợ kỹ thuật...) vì không phản ánh sản phẩm
      // công ty cho thuê.
      topRevenue: reportRows
        .filter((r) => r.type.product_type === "rental" && (r.report?.revenue ?? 0) > 0)
        .sort((a, b) => (b.report?.revenue ?? 0) - (a.report?.revenue ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: r.report!.revenue })),
      topRentalCount: reportRows
        .filter((r) => r.type.product_type === "rental" && (r.report?.rental_count ?? 0) > 0)
        .sort((a, b) => (b.report?.rental_count ?? 0) - (a.report?.rental_count ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: r.report!.rental_count })),
      topProfitRatio: reportRows
        .filter((r) => r.type.product_type === "rental" && r.report?.profit_ratio != null)
        .sort((a, b) => (b.report?.profit_ratio ?? 0) - (a.report?.profit_ratio ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: (r.report?.profit_ratio ?? 0) * 100 })),
      topInventoryValue: reportRows
        .filter((r) => (r.report?.current_inventory_value ?? 0) > 0)
        .sort((a, b) => (b.report?.current_inventory_value ?? 0) - (a.report?.current_inventory_value ?? 0))
        .slice(0, TOP_N)
        .map((r) => ({ label: r.type.name, value: r.report!.current_inventory_value })),
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
          <EquipmentCategoryFilter categories={categoryList} value={activeCategory} />
          {canManageCatalog && (
            <EquipmentTypeDialog templates={templateList} categories={categoryList} />
          )}
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

              {/* Cùng câu chuyện với 3 con số trên (giá trị hàng đang nằm
                  trong kho) nên nằm chung thẻ — và quan trọng là nó KHÔNG
                  chịu ảnh hưởng của bộ lọc thời gian ở mục "Báo cáo", để
                  dưới đó dễ hiểu nhầm là số liệu theo kỳ đã chọn. */}
              <div className="mt-6 border-t pt-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Hàng hoá chiếm nhiều vốn tồn kho nhất
                </p>
                <RevenueBarList
                  points={reportSummary.topInventoryValue}
                  labelWidthClassName="w-32"
                />
              </div>
            </CardContent>
          </Card>

          {canViewProductHighlights && (
            <>
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
            </>
          )}
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
                  ? `${stockValue(type)} sản phẩm`
                  : `${stockValue(type)}`;

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
                    <span>
                      {type.name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {categoryNameById.get(type.category_id ?? "") ?? "Chưa phân loại"}
                      </span>
                    </span>
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
                        <EquipmentTypeDialog
                          templates={templateList}
                          categories={categoryList}
                          equipmentType={type}
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
