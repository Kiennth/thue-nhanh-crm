import { Fragment } from "react";
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
import { vnTodayString } from "@/lib/vn-time";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PaginationControls } from "@/components/pagination-controls";
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import { computeEquipmentRevenueOverview } from "@/lib/equipment-revenue-overview";
import { StatCard } from "@/components/stat-card";
import { PeriodStatCards } from "../../orders/period-stat-cards";
import { OrdersTrendChart } from "../../orders/orders-trend-chart";
import {
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
import { ProductActionBar } from "./product-action-bar";
import { DepositReviewBox } from "./deposit-review-box";
import { PriceTierEditor } from "./price-tier-editor";
import type { PricingTierInput } from "@/lib/rental-pricing";
import { EquipmentUnitDialog } from "../equipment-unit-dialog";
import { EquipmentStockDialog } from "../equipment-stock-dialog";
import { TransferStockDialog } from "../transfer-stock-dialog";
import { TransferInstancesDialog } from "../transfer-instances-dialog";
import { EquipmentInstanceDialog } from "../equipment-instance-dialog";
import { EquipmentInstanceDisposeDialog } from "../equipment-instance-dispose-dialog";
import { EquipmentPurchaseDialog } from "../equipment-purchase-dialog";
import { EquipmentCostAdjustmentDialog } from "../equipment-cost-adjustment-dialog";
import { EquipmentDisposalDialog } from "../equipment-disposal-dialog";
import { RfidTagDialog } from "../rfid-tag-dialog";
import {
  AddComboAlternativeButton,
  AddComboComponentForm,
  ComboComponentQuantityForm,
  RemoveComboAlternativeButton,
} from "./combo-components-editor";
import { removeComboComponent } from "@/lib/actions/equipment";
import { countAssemblableSets } from "@/lib/combo";
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

// Thứ tự + màu nhóm kho trong bảng máy serial (cùng màu với BranchBadge).
const INSTANCE_BRANCH_ORDER = ["TP HCM", "Hà Nội", "Đà Nẵng"];
const INSTANCE_BRANCH_COLOR: Record<string, string> = {
  "TP HCM": "--chart-2",
  "Hà Nội": "--chart-1",
  "Đà Nẵng": "--chart-3",
};

const TABS = [
  { value: "stock", label: "Tồn kho" },
  // B3: thang giá thuê nhiều ngày (chỉ hàng cho thuê theo ngày).
  { value: "pricing", label: "Bảng giá" },
  { value: "revenue", label: "Doanh thu" },
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
  const requestedTab: Tab =
    tab === "history"
      ? "history"
      : tab === "rentals"
        ? "rentals"
        : tab === "revenue"
          ? "revenue"
          : tab === "pricing"
            ? "pricing"
            : "stock";
  const requestedRentalPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  const [{ data: type }, { data: templates }, { data: categories }, { data: branches }, employee, { data: tierRows }] =
    await Promise.all([
      supabase.from("equipment_types").select("*").eq("id", id).maybeSingle(),
      supabase.from("pricing_templates").select("*").order("name"),
      supabase.from("equipment_categories").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("branches").select("id, name, position").order("position"),
      getCurrentEmployee(),
      // Bậc giá của mẫu chung + thang riêng mã này — cho tab Bảng giá (ít dòng).
      supabase.from("pricing_template_tiers").select("template_id, min_duration, duration_unit, discount_percentage"),
    ]);
  if (!type) notFound();
  // Nhãn web + người bấm Ngừng kinh doanh cho thanh thao tác (B8).
  const [{ data: webRow }, { data: stoppedBy }] = await Promise.all([
    supabase.from("website_products").select("is_featured, is_new").eq("equipment_type_id", id).maybeSingle(),
    type.discontinued_by
      ? supabase.from("employees_public").select("name").eq("id", type.discontinued_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const canManageCatalog = !!employee && MANAGE_ROLES.includes(employee.role);
  const canManageStock = !!employee && EQUIPMENT_WRITE_ROLES.includes(employee.role);
  // Doanh thu là số liệu điều hành nhạy cảm — cùng luật ẩn với Admin đã có ở
  // trang danh sách /equipment (canViewEquipmentReports): Admin quản trị
  // được danh mục nhưng không xem doanh thu.
  const canViewRevenue = canManageCatalog && employee?.role !== "admin";
  const hasPricingTab = type.product_type === "rental" && type.rental_period_unit === "day" && type.tracking_type !== "combo";
  const activeTab: Tab =
    (requestedTab === "revenue" && !canViewRevenue) || (requestedTab === "pricing" && !hasPricingTab)
      ? "stock"
      : requestedTab;

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

  const revenueOverview =
    activeTab === "revenue" && canViewRevenue ? await computeEquipmentRevenueOverview(id) : null;

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

  // Combo (CEO 2026-09-26): món con + số hàng sẵn có từng kho để biết ghép
  // được bao nhiêu bộ ở đâu.
  const isCombo = type.tracking_type === "combo";
  let comboRows: {
    id: string;
    componentTypeId: string;
    name: string;
    quantity: number;
    alternatives: { id: string; name: string }[];
    availableByBranch: Map<string, number>;
  }[] = [];
  let comboPickerOptions: { key: string; label: string }[] = [];
  if (isCombo && activeTab === "stock") {
    const [{ data: components }, { data: rentalTypes }] = await Promise.all([
      supabase
        .from("equipment_type_components")
        .select("id, component_type_id, quantity")
        .eq("combo_type_id", id)
        .order("position"),
      supabase
        .from("equipment_types")
        .select("id, name, tracking_type")
        .eq("product_type", "rental")
        .in("tracking_type", ["individual", "quantity"])
        .order("name"),
    ]);
    const { data: alternatives } = (components ?? []).length
      ? await supabase
          .from("equipment_type_component_alternatives")
          .select("id, component_id, alternative_type_id, position")
          .in(
            "component_id",
            (components ?? []).map((c) => c.id),
          )
          .order("position")
      : { data: [] };
    const componentTypeIds = [
      ...new Set([
        ...(components ?? []).map((c) => c.component_type_id),
        ...(alternatives ?? []).map((a) => a.alternative_type_id),
      ]),
    ];
    const [{ data: availableInstances }, { data: componentUnits }] = componentTypeIds.length
      ? await Promise.all([
          supabase
            .from("equipment_instances")
            .select("equipment_type_id, branch_id")
            .in("equipment_type_id", componentTypeIds)
            .eq("status", "available"),
          supabase
            .from("equipment_units")
            .select("id, equipment_type_id")
            .in("equipment_type_id", componentTypeIds),
        ])
      : [{ data: [] }, { data: [] }];
    const componentUnitIds = (componentUnits ?? []).map((u) => u.id);
    const { data: componentStock } = componentUnitIds.length
      ? await supabase
          .from("equipment_stock")
          .select("equipment_unit_id, branch_id, quantity_in_stock")
          .in("equipment_unit_id", componentUnitIds)
      : { data: [] };
    const typeIdByUnit = new Map((componentUnits ?? []).map((u) => [u.id, u.equipment_type_id]));
    const rentalTypeById = new Map((rentalTypes ?? []).map((t) => [t.id, t]));

    // Sẵn có từng kho của 1 loại hàng (máy serial "sẵn có" / tồn "trong kho").
    const availableOf = (typeId: string) => {
      const byBranch = new Map<string, number>();
      if (rentalTypeById.get(typeId)?.tracking_type === "individual") {
        for (const i of availableInstances ?? []) {
          if (i.equipment_type_id !== typeId || !i.branch_id) continue;
          byBranch.set(i.branch_id, (byBranch.get(i.branch_id) ?? 0) + 1);
        }
      } else {
        for (const st of componentStock ?? []) {
          if (typeIdByUnit.get(st.equipment_unit_id) !== typeId) continue;
          byBranch.set(st.branch_id, (byBranch.get(st.branch_id) ?? 0) + st.quantity_in_stock);
        }
      }
      return byBranch;
    };

    comboRows = (components ?? []).map((c) => {
      const rowAlternatives = (alternatives ?? []).filter((a) => a.component_id === c.id);
      // Món có máy thay thế: sẵn có = cộng dồn mọi lựa chọn.
      const availableByBranch = new Map<string, number>();
      for (const typeId of [c.component_type_id, ...rowAlternatives.map((a) => a.alternative_type_id)]) {
        for (const [branchId, qty] of availableOf(typeId)) {
          availableByBranch.set(branchId, (availableByBranch.get(branchId) ?? 0) + qty);
        }
      }
      return {
        id: c.id,
        componentTypeId: c.component_type_id,
        name: rentalTypeById.get(c.component_type_id)?.name ?? "—",
        quantity: c.quantity,
        alternatives: rowAlternatives.map((a) => ({
          id: a.id,
          name: rentalTypeById.get(a.alternative_type_id)?.name ?? "—",
        })),
        availableByBranch,
      };
    });
    comboPickerOptions = (rentalTypes ?? [])
      .filter((t) => t.id !== id)
      .map((t) => ({ key: t.id, label: t.name }));
  }

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

  const branchList = branches ?? [];
  const templateList = templates ?? [];
  const categoryList = categories ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const branchPositionById = new Map(branchList.map((b, idx) => [b.id, b.position ?? idx]));
  const templateNameById = new Map(templateList.map((t) => [t.id, t.name]));
  // B3: bảng giá mẫu chung + thang riêng của chính mã này (thang riêng mã khác ẩn).
  const sharedTemplates = templateList.filter((t) => !t.owner_equipment_type_id);
  const ownTemplate = templateList.find((t) => t.owner_equipment_type_id === type.id) ?? null;
  const dialogTemplates = templateList
    .filter((t) => !t.owner_equipment_type_id || t.owner_equipment_type_id === type.id)
    .map((t) => (t.owner_equipment_type_id ? { ...t, name: "Thang giá riêng (mã này)" } : t));
  const tiersByTemplate = new Map<string, PricingTierInput[]>();
  for (const t of tierRows ?? []) {
    const list = tiersByTemplate.get(t.template_id) ?? [];
    list.push({ min_duration: t.min_duration, duration_unit: t.duration_unit, discount_percentage: Number(t.discount_percentage) });
    tiersByTemplate.set(t.template_id, list);
  }

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

  // Nguồn mua từng máy (CEO 2026-10-07): phiếu mua → NCC. RLS chỉ trả phiếu
  // người xem có quyền (GĐ/Admin/KT/CHT kho mình) — không quyền thì "—".
  const poIds = [
    ...new Set(
      (instances ?? [])
        .map((i) => (i as { purchase_order_id?: string | null }).purchase_order_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const { data: poRows } = poIds.length
    ? await supabase.from("purchase_orders" as never).select("id, code, suppliers(name)").in("id", poIds)
    : { data: [] };
  const poById = new Map(
    ((poRows ?? []) as unknown as { id: string; code: string; suppliers: { name: string } | null }[]).map((p) => [p.id, p]),
  );

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
  const instanceGroupRank = (inst: EquipmentInstanceRow) => {
    if (inst.status === "disposed") return INSTANCE_BRANCH_ORDER.length + 1;
    const idx = INSTANCE_BRANCH_ORDER.indexOf(branchNameById.get(inst.branch_id ?? "") ?? "");
    return idx === -1 ? INSTANCE_BRANCH_ORDER.length : idx;
  };
  // Máy tạm lịch sử (CEO 2026-10-06 hỏi "ĐÃ THANH LÝ xám xám là gì"): lúc nhập
  // lịch sử Booqable, dòng đơn cũ không ghi serial được gắn 1 máy tạm AUTO-*
  // rồi đánh "đã thanh lý" để không tính tồn kho. Không phải thanh lý thật
  // (không ngày, không giá) → tách khỏi nhóm "Đã thanh lý", gom vào 1 khối
  // thu gọn dưới bảng. ~1.984 máy kiểu này trên 224 mã, thanh lý thật chỉ ~12.
  const isHistoryPlaceholder = (inst: EquipmentInstanceRow) =>
    inst.status === "disposed" &&
    inst.identifier_code.startsWith("AUTO") &&
    !inst.disposal_date &&
    !inst.disposal_price;
  const historyPlaceholders = (instances ?? []).filter(isHistoryPlaceholder);
  const realInstances = (instances ?? []).filter((i) => !isHistoryPlaceholder(i));
  const sortedInstances = [...realInstances].sort((a, b) => {
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
    // Mặc định (CEO 2026-10-01): máy còn tồn gom theo kho HCM → HN → ĐN,
    // máy đã thanh lý dồn xuống cuối.
    return (
      instanceGroupRank(a) - instanceGroupRank(b) ||
      a.identifier_code.localeCompare(b.identifier_code, "vi")
    );
  });
  const groupInstancesByBranch = !activeSort;
  // Cột "Sản phẩm" ở tab lượt thuê: mã máy (serial) hoặc tên biến thể — SP
  // số lượng chỉ 1 biến thể thì cột toàn "—", ẩn luôn.
  const showRentalProductColumn = isRentalIndividual || unitList.length > 1;
  // Chỉ 1 biến thể thì tên biến thể trùng/thừa — ẩn (CEO 2026-10-01).
  const showInstanceUnitColumn = unitList.length > 1;
  const instanceTableColSpan = (canManageStock ? 7 : 6) + (showInstanceUnitColumn ? 1 : 0);
  // Bảo hành (CEO 2026-10-06): đỏ = đã hết, vàng = còn ≤ 30 ngày.
  const todayKey = vnTodayString();
  const soonDate = new Date(`${todayKey}T00:00:00Z`);
  soonDate.setUTCDate(soonDate.getUTCDate() + 30);
  const soonKey = soonDate.toISOString().slice(0, 10);
  const warrantyCell = (d: string | null) => {
    if (!d) return <span className="text-muted-foreground">—</span>;
    const [y, m, day] = d.slice(0, 10).split("-");
    const label = `${day}/${m}/${y}`;
    if (d < todayKey) return <span className="font-medium text-red-600 dark:text-red-400" title="Đã hết bảo hành">{label} · hết</span>;
    if (d <= soonKey) return <span className="font-medium text-amber-600 dark:text-amber-400" title="Sắp hết bảo hành">{label}</span>;
    return <span>{label}</span>;
  };
  // Dòng tiêu đề mỗi nhóm kho: "TP HCM · 12 máy — 9 sẵn sàng · 3 đang thuê".
  const instanceGroupSummary = new Map<string, string>();
  {
    const byGroup = new Map<string, EquipmentInstanceRow[]>();
    for (const inst of realInstances) {
      const key =
        inst.status === "disposed" ? "__disposed" : (branchNameById.get(inst.branch_id ?? "") ?? "");
      byGroup.set(key, [...(byGroup.get(key) ?? []), inst]);
    }
    for (const [key, list] of byGroup) {
      if (key === "__disposed") {
        instanceGroupSummary.set(key, `Đã thanh lý · ${list.length} máy`);
        continue;
      }
      const counts = (["available", "rented", "maintenance"] as const)
        .map((s) => [s, list.filter((i) => i.status === s).length] as const)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${EQUIPMENT_INSTANCE_STATUS_LABELS[s].toLowerCase()}`);
      instanceGroupSummary.set(
        key,
        `${key || "Chưa gán kho"} · ${list.length} máy${counts.length ? ` — ${counts.join(" · ")}` : ""}`,
      );
    }
  }

  // Ghép + sắp xếp bảng lịch sử thuê — bỏ dòng nào không tra được order (dữ
  // liệu mồ côi, không nên xảy ra nhưng phòng hờ).
  const rentalRows = (rentalLines ?? [])
    .map((line) => {
      const order = rentalOrderById.get(line.order_id);
      if (!order) return null;
      const productLabel = line.equipment_instance_id
        ? (instanceById.get(line.equipment_instance_id)?.identifier_code ?? "—")
        : line.equipment_unit_id && unitList.length > 1
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
          ? ownTemplate && type.pricing_template_id === ownTemplate.id
            ? " · thang giá riêng"
            : ` · bảng giá: ${templateNameById.get(type.pricing_template_id ?? "") ?? "—"}`
          : "") +
        // B7: cọc 0 = "Không cần cọc" (không bao giờ "0đ"); combo = tổng món con.
        (type.tracking_type === "combo"
          ? ""
          : type.deposit_negotiable
            ? " · cọc: thoả thuận theo hồ sơ"
            : type.deposit_amount > 0
              ? ` · cọc: ${currencyFormatter.format(type.deposit_amount)}đ`
              : " · Không cần cọc")
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
                {/* Huy hiệu trạng thái (B8): Ngừng → Sắp ra mắt → Đang kinh doanh. */}
                {type.discontinued_at ? (
                  <Badge variant="secondary">Ngừng kinh doanh</Badge>
                ) : type.is_unreleased ? (
                  <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                    Sắp ra mắt
                    {type.expected_launch_date
                      ? ` · ${new Date(type.expected_launch_date + "T00:00:00").toLocaleDateString("vi-VN")}`
                      : ""}
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Đang kinh doanh</Badge>
                )}
                {!type.discontinued_at && webRow?.is_featured && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200">🔥 Thuê nhiều</Badge>
                )}
                {!type.discontinued_at && webRow?.is_new && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">Mới</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{priceLine}</p>
              {/* Phụ kiện đi kèm (CEO 2026-10-06, học Booqable) — chip từng món, tách bằng "|". */}
              {type.default_extra_information?.trim() && (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-xs text-muted-foreground">Phụ kiện:</span>
                  {type.default_extra_information
                    .split("|")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((item, i) => (
                      <Badge key={i} variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                        {item}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        {canManageCatalog && (
          <CardContent>
            <ProductActionBar
              id={type.id}
              name={type.name}
              discontinuedAt={type.discontinued_at}
              discontinuedByName={stoppedBy?.name ?? null}
              isUnreleased={type.is_unreleased}
              launchDate={type.expected_launch_date}
              web={webRow ? { featured: webRow.is_featured, isNew: webRow.is_new } : null}
              editButton={
                <EquipmentTypeDialog
                  templates={dialogTemplates}
                  categories={categoryList}
                  equipmentType={type}
                  editTriggerVariant="outline"
                />
              }
            />
            {type.deposit_review_status === "needs_review" && !type.discontinued_at && (
              <DepositReviewBox id={type.id} pricePerDay={type.price} />
            )}
          </CardContent>
        )}
      </Card>

      <div className="flex items-center gap-1 border-b">
        {TABS.filter((t) => (t.value !== "revenue" || canViewRevenue) && (t.value !== "pricing" || hasPricingTab)).map((t) => (
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

          {isCombo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Thành phần combo</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Thêm combo vào đơn thì mỗi món dưới đây thành 1 dòng thật (tự chọn máy trống ở kho
                  giao), tiền combo chia cho từng món theo giá thuê lẻ. Combo không có tồn kho
                  riêng.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {comboRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Món</TableHead>
                          <TableHead className="w-32">SL / bộ</TableHead>
                          {(branches ?? []).map((b) => (
                            <TableHead key={b.id} className="text-right">
                              Sẵn có {b.name}
                            </TableHead>
                          ))}
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comboRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/equipment/${row.componentTypeId}`}
                                className="underline-offset-2 hover:underline"
                              >
                                {row.name}
                              </Link>
                              {row.alternatives.length > 0 && (
                                <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                                  hết thì lấy:{" "}
                                  {row.alternatives.map((alt, i) => (
                                    <span key={alt.id} className="whitespace-nowrap">
                                      {i > 0 && " → "}
                                      {alt.name}
                                      {canManageCatalog && (
                                        <RemoveComboAlternativeButton alternativeId={alt.id} label={alt.name} />
                                      )}
                                    </span>
                                  ))}
                                </p>
                              )}
                              {canManageCatalog && (
                                <AddComboAlternativeButton componentId={row.id} options={comboPickerOptions} />
                              )}
                            </TableCell>
                            <TableCell>
                              {canManageCatalog ? (
                                <ComboComponentQuantityForm componentId={row.id} quantity={row.quantity} />
                              ) : (
                                row.quantity
                              )}
                            </TableCell>
                            {(branches ?? []).map((b) => (
                              <TableCell key={b.id} className="text-right tabular-nums">
                                {row.availableByBranch.get(b.id) ?? 0}
                              </TableCell>
                            ))}
                            <TableCell>
                              {canManageCatalog && (
                                <ConfirmDeleteButton
                                  confirmMessage={`Bỏ "${row.name}" khỏi combo? Đơn đã có combo này không bị ảnh hưởng.`}
                                  successMessage="Đã bỏ món khỏi combo."
                                  action={removeComboComponent}
                                  actionArg={row.id}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-medium">
                          <TableCell colSpan={2}>Ghép được (bộ)</TableCell>
                          {(branches ?? []).map((b) => (
                            <TableCell key={b.id} className="text-right tabular-nums">
                              {countAssemblableSets(
                                comboRows.map((r) => ({
                                  quantity: r.quantity,
                                  available: r.availableByBranch.get(b.id) ?? 0,
                                })),
                              )}
                            </TableCell>
                          ))}
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Combo chưa có món nào — thêm món bên dưới trước khi đưa vào đơn.
                  </p>
                )}
                {canManageCatalog && (
                  <AddComboComponentForm comboTypeId={type.id} options={comboPickerOptions} />
                )}
              </CardContent>
            </Card>
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
                        {/* SP chỉ 1 biến thể: tên biến thể trùng tên SP, bỏ
                            đi cho gọn (CEO 2026-10-01) — vẫn sửa được qua nút
                            bút chì nếu sau này tách thêm biến thể. */}
                        {(unitList.length > 1 || unit.price != null) && (
                          <p className="font-medium">
                            {unitList.length > 1 && unit.brand_model}
                            {unit.price != null && (
                              <span
                                className={cn(
                                  "text-muted-foreground text-sm font-normal",
                                  unitList.length > 1 && "ml-2",
                                )}
                              >
                                {currencyFormatter.format(unit.price)}đ
                              </span>
                            )}
                          </p>
                        )}
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
            <div className="flex flex-col items-center gap-2">
              <p className="text-center text-sm text-muted-foreground">Chưa có biến thể nào.</p>
              {/* Mã mới tạo: Mua hàng luôn được — tự tạo biến thể mặc định. */}
              {canManageStock && <EquipmentPurchaseDialog equipmentTypeId={type.id} branches={branchList} />}
            </div>
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

              {/* Chuyển kho nhanh nhiều máy — CEO yêu cầu 2026-08-08. Chỉ
                  canManageCatalog (khớp RLS: cua_hang_truong không đổi được
                  branch_id của instance, xem transferEquipmentInstances).
                  Máy đang cho thuê/đã thanh lý không chuyển được — lọc sẵn. */}
              {canManageCatalog && (
                <div className="flex justify-end">
                  <TransferInstancesDialog
                    equipmentTypeId={type.id}
                    branches={branchList}
                    instances={sortedInstances
                      .filter((i) => i.status === "available" || i.status === "maintenance")
                      .map((i) => ({
                        id: i.id,
                        identifier_code: i.identifier_code,
                        branch_id: i.branch_id,
                        branchName: branchNameById.get(i.branch_id ?? "") ?? "Chưa gán",
                      }))}
                  />
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã định danh</TableHead>
                    {showInstanceUnitColumn && <TableHead>Biến thể</TableHead>}
                    <SortableTableHead sortKey="branch" label="Chi nhánh" />
                    <SortableTableHead sortKey="status" label="Trạng thái" />
                    <TableHead>Bảo hành đến</TableHead>
                    <TableHead>Mua từ</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    {canManageStock && <TableHead className="w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstances.map((inst, idx) => {
                    const instTags = rfidTagsByInstance.get(inst.id) ?? [];
                    const branchName = branchNameById.get(inst.branch_id ?? "") ?? "";
                    const disposed = inst.status === "disposed";
                    const groupKey = disposed ? "__disposed" : branchName;
                    const prev = sortedInstances[idx - 1];
                    const prevGroupKey = prev
                      ? prev.status === "disposed"
                        ? "__disposed"
                        : (branchNameById.get(prev.branch_id ?? "") ?? "")
                      : null;
                    const colorVar = disposed ? null : (INSTANCE_BRANCH_COLOR[branchName] ?? null);
                    const groupHeader =
                      groupInstancesByBranch && groupKey !== prevGroupKey
                        ? (instanceGroupSummary.get(groupKey) ?? null)
                        : null;
                    return (
                      <Fragment key={inst.id}>
                      {groupHeader && (
                        <TableRow
                          className="hover:bg-transparent"
                          style={
                            colorVar
                              ? { backgroundColor: `color-mix(in oklch, var(${colorVar}) 16%, transparent)` }
                              : undefined
                          }
                        >
                          <TableCell
                            colSpan={instanceTableColSpan}
                            className={cn(
                              "border-l-4 py-1.5 text-xs font-semibold uppercase tracking-wide",
                              !colorVar && "border-l-border text-muted-foreground",
                            )}
                            style={colorVar ? { borderLeftColor: `var(${colorVar})` } : undefined}
                          >
                            {groupHeader}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        className={cn(disposed && groupInstancesByBranch && "text-muted-foreground")}
                        style={
                          groupInstancesByBranch && colorVar
                            ? { backgroundColor: `color-mix(in oklch, var(${colorVar}) 6%, transparent)` }
                            : undefined
                        }
                      >
                        <TableCell
                          className={cn("font-medium", groupInstancesByBranch && "border-l-4 border-l-transparent")}
                          style={
                            groupInstancesByBranch && colorVar ? { borderLeftColor: `var(${colorVar})` } : undefined
                          }
                        >
                          {inst.identifier_code}
                        </TableCell>
                        {showInstanceUnitColumn && (
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
                        <TableCell className="whitespace-nowrap text-sm">
                          {inst.status === "disposed" ? "—" : warrantyCell(inst.warranty_expires_on)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const poId = (inst as { purchase_order_id?: string | null }).purchase_order_id;
                            const po = poId ? poById.get(poId) : undefined;
                            return po ? (
                              <Link href={`/purchases/${po.id}`} className="hover:underline">
                                <span className="font-medium">{po.suppliers?.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {po.code}
                                  {inst.purchase_price ? ` · ${new Intl.NumberFormat("vi-VN").format(Number(inst.purchase_price))}đ` : ""}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
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
                      </Fragment>
                    );
                  })}
                  {!realInstances.length && (
                    <TableRow>
                      <TableCell
                        colSpan={instanceTableColSpan}
                        className="text-center text-muted-foreground"
                      >
                        Chưa có sản phẩm nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {historyPlaceholders.length > 0 && (
                <details className="mt-3 rounded-md border border-dashed px-3 py-2 text-sm">
                  <summary className="cursor-pointer select-none text-muted-foreground">
                    Lịch sử nhập từ Booqable · {historyPlaceholders.length} dòng
                    <span className="ml-1 text-xs">
                      (máy tạm gắn cho đơn cũ không ghi serial — không phải máy thật, không tính tồn kho)
                    </span>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {historyPlaceholders
                      .sort((a, b) => a.identifier_code.localeCompare(b.identifier_code))
                      .map((i) => (
                        <span key={i.id} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {i.identifier_code}
                        </span>
                      ))}
                  </div>
                </details>
              )}

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

      {activeTab === "pricing" && hasPricingTab && (
        <PriceTierEditor
          typeId={type.id}
          basePrice={type.price}
          canEdit={employee?.role === "giam_doc"}
          sharedTemplates={sharedTemplates.map((t) => ({ id: t.id, name: t.name, tiers: tiersByTemplate.get(t.id) ?? [] }))}
          currentTemplateId={type.pricing_method === "pricing_structure" ? type.pricing_template_id : null}
          customTiers={
            ownTemplate && type.pricing_template_id === ownTemplate.id ? (tiersByTemplate.get(ownTemplate.id) ?? []) : null
          }
          variants={unitList
            .filter((u) => u.price != null && u.price !== type.price)
            .map((u) => ({ label: u.brand_model, price: u.price! }))}
        />
      )}

      {activeTab === "revenue" && canViewRevenue && revenueOverview && (
        <div className="space-y-4">
          <StatCard label="Toàn bộ thời gian" value={`${revenueOverview.allTime.count} lượt`}>
            <p className="text-sm text-muted-foreground">
              Doanh thu: {currencyFormatter.format(revenueOverview.allTime.revenue)}đ
            </p>
          </StatCard>
          <PeriodStatCards
            week={revenueOverview.week}
            month={revenueOverview.month}
            year={revenueOverview.year}
            unitLabel="lượt thuê"
          />
          <OrdersTrendChart trend={revenueOverview.trend} />
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
                  {showRentalProductColumn && <TableHead>Sản phẩm</TableHead>}
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
                    {showRentalProductColumn && <TableCell>{productLabel}</TableCell>}
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
                    <TableCell
                      colSpan={showRentalProductColumn ? 8 : 7}
                      className="text-center text-muted-foreground"
                    >
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
                  {unitList.length > 1 && <TableHead>Biến thể</TableHead>}
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
                      {unitList.length > 1 && <TableCell>{unit?.brand_model ?? "—"}</TableCell>}
                      <TableCell>{branchNameById.get(t.from_branch_id) ?? "—"}</TableCell>
                      <TableCell>{branchNameById.get(t.to_branch_id) ?? "—"}</TableCell>
                      <TableCell>{t.quantity}</TableCell>
                      <TableCell>{t.note ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!transfers?.length && (
                  <TableRow>
                    <TableCell
                      colSpan={unitList.length > 1 ? 6 : 5}
                      className="text-center text-muted-foreground"
                    >
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
