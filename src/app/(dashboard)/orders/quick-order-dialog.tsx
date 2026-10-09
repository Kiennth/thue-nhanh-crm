"use client";

import { useMemo, useRef, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, ClipboardList, Loader2, Minus, Package, Plus, Search, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getQuickOrderCatalog,
  quickCreateOrder,
  type QuickOrderCatalog,
  type QuickOrderCatalogItem,
} from "@/lib/actions/orders";
import {
  computeOrderLinePrice,
  computeRentalDurationInUnit,
  defaultRentalStart,
} from "@/lib/rental-pricing";
import { cn } from "@/lib/utils";
import type { PricingMethod, ProductType, RentalPeriodUnit } from "@/types/database";
import { createCustomerFromWebOrder } from "@/lib/actions/website-orders";
import { CustomerCombobox } from "./customer-combobox";
import { DateInput } from "@/components/date-input";
import { OrdererSuggestInput } from "@/components/orderer-suggest-input";

// Popup "Tạo đơn nhanh" (CEO 2026-10-03, phương án A + B + C): mọi thứ cần
// cho 1 đơn thường trên 1 màn hình — khách, kho, gói thời gian, hàng (nhập số
// lượng, máy serial hệ thống tự chọn), phí giao/thu hồi — bấm 1 nút là đơn có
// đủ dòng hàng, giá, và khâu Tiếp nhận/Báo giá (± Chốt đơn) đã hoàn thành.
// Ô ít dùng (mã đơn, kho thu hồi, người đặt...) gập trong "Thêm chi tiết".

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
// Cùng 4 mã với DELIVERY_NOTE_TYPE_IDS (lib/commission) — không import file
// đó vì nó kéo theo vn-time (chỉ chạy phía server).
const TRANSPORT_LABELS: Record<string, string> = {
  "38f5c644-3898-4b1f-a3f5-901e55f77c6a": "Giao xe máy",
  "13c85fe0-8b13-4d76-9df5-a20b19598cc9": "Thu hồi xe máy",
  "ce4a5f88-8daa-47c2-92fc-196d1fc321db": "Giao ô tô",
  "1a53924a-a070-44b0-9441-3f09042af7e7": "Thu hồi ô tô",
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

function datePart(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hourPart(d: Date) {
  return String(d.getHours()).padStart(2, "0");
}
function minutePart(d: Date) {
  return String(d.getMinutes()).padStart(2, "0");
}
function combine(date: string, hour: string, minute = "00") {
  return new Date(`${date}T${hour}:${minute}:00`);
}

// hours: dịch vụ tính theo giờ (rentalPeriodUnit có) — số giờ thực hiện, mặc định 1.
type CartLine = { item: QuickOrderCatalogItem; quantity: number; hours?: number };
const isHourlyService = (item: QuickOrderCatalogItem) => item.productType === "service" && !!item.rentalPeriodUnit;
const HOUR_UNIT_LABELS: Record<string, string> = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng", year: "năm" };

// Dữ liệu điền sẵn khi "Lên đơn" từ 1 đơn web (CEO 2026-10-04).
export interface QuickOrderPrefill {
  webOrderId: string;
  branchId: string | null;
  startAt: string;
  endAt: string;
  items: { typeId: string; unitId: string | null; quantity: number }[];
  // Giao tận nơi → tự thêm phí giao + thu hồi xe máy.
  ship: boolean;
  customer: { id: string; name: string } | null;
  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;
  deliveryAddress?: string | null;
}
const BIKE_DELIVERY_ID = "38f5c644-3898-4b1f-a3f5-901e55f77c6a";
const BIKE_COLLECTION_ID = "13c85fe0-8b13-4d76-9df5-a20b19598cc9";
const CAR_DELIVERY_ID = "ce4a5f88-8daa-47c2-92fc-196d1fc321db";
const CAR_COLLECTION_ID = "1a53924a-a070-44b0-9441-3f09042af7e7";
// Mặc định xe máy chở tối đa 5 cái/món (giống web — SHIP_RATES.defaultBikeMaxQty).
const DEFAULT_BIKE_MAX_QTY = 5;

// Popup chia 4 ô đánh số, mỗi ô 1 tông màu nhạt (CEO 2026-10-06: "màu mè, chia
// ô cho đỡ nhàm chán, dễ bấm"). Ô số tròn đậm, nền ô nhạt cùng tông, dark mode
// dịu lại. Tông cố định theo bước: 1 xanh dương (khách) · 2 hổ phách (thời
// gian) · 3 xanh lá (hàng) · 4 tím (giao nhận).
const SECTION_TONES = {
  blue: {
    card: "border-blue-200 bg-blue-50/70 dark:border-blue-900/70 dark:bg-blue-950/30",
    badge: "bg-blue-600 text-white",
    title: "text-blue-900 dark:text-blue-200",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/30",
    badge: "bg-amber-500 text-white",
    title: "text-amber-900 dark:text-amber-200",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30",
    badge: "bg-emerald-600 text-white",
    title: "text-emerald-900 dark:text-emerald-200",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-900/70 dark:bg-violet-950/30",
    badge: "bg-violet-600 text-white",
    title: "text-violet-900 dark:text-violet-200",
  },
} as const;

// Dấu * đỏ cho ô bắt buộc (đề xuất CRM v2 §4.5).
function Req() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

function Section({
  n,
  title,
  hint,
  tone,
  icon,
  children,
}: {
  n: number;
  title: React.ReactNode;
  hint?: string;
  tone: keyof typeof SECTION_TONES;
  icon: ReactElement;
  children: React.ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={cn("rounded-xl border p-3.5 sm:p-4", t.card)}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", t.badge)}>
          {n}
        </span>
        <span className={cn("[&_svg]:size-4", t.title)}>{icon}</span>
        <h3 className={cn("text-sm font-semibold", t.title)}>{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// Gói thuê bấm nhanh ở ô Thời gian: trả = nhận + N ngày (giờ giữ nguyên).
const QUICK_DAYS = [1, 2, 3, 5, 7, 14, 30] as const;
// Thuê dài hạn (CEO 2026-10-06, giống web): gói cam kết 3/6/12 tháng = 90/180/360
// ngày (1 tháng = 30 ngày theo quy ước bảng giá), tạm tính hiện thêm giá mỗi tháng.
const LONG_TERM = [
  { months: 3, days: 90 },
  { months: 6, days: 180 },
  { months: 12, days: 360 },
] as const;

function HourSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-transparent px-2 text-sm"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {h}:00
        </option>
      ))}
    </select>
  );
}

export function QuickOrderDialog({
  branches,
  prefill,
  trigger,
}: {
  branches: { id: string; name: string }[];
  prefill?: QuickOrderPrefill;
  trigger?: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<QuickOrderCatalog | null>(null);
  const [, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(prefill?.customer ?? null);
  const customerId = customer?.id ?? null;
  const [customerKey, setCustomerKey] = useState(0);
  const [creatingCustomer, startCreatingCustomer] = useTransition();
  const [branchId, setBranchId] = useState<string>(prefill?.branchId ?? "");
  const [start] = useState(() => (prefill ? new Date(prefill.startAt) : defaultRentalStart(new Date())));
  const [prefillEnd] = useState(() => (prefill ? new Date(prefill.endAt) : null));
  const [startDate, setStartDate] = useState(() => datePart(start));
  const [startHour, setStartHour] = useState(() => hourPart(start));
  // Giữ phút lẻ từ đơn web (khách chọn 08:30…) — popup chỉ chọn giờ chẵn.
  const [startMinute, setStartMinute] = useState(() => minutePart(start));
  const [endDate, setEndDate] = useState(() => datePart(prefillEnd ?? new Date(start.getTime() + 86_400_000)));
  const [endHour, setEndHour] = useState(() => hourPart(prefillEnd ?? start));
  const [endMinute, setEndMinute] = useState(() => (prefillEnd ? minutePart(prefillEnd) : "00"));
  // Đổi giờ nhận → giờ trả dời theo, giữ nguyên thời lượng (CEO 2026-10-05).
  function changeStart(nextDate: string, nextHour: string) {
    const oldStart = combine(startDate, startHour, startMinute).getTime();
    const oldEnd = combine(endDate, endHour, endMinute).getTime();
    const nextStart = combine(nextDate, nextHour, startMinute).getTime();
    setStartDate(nextDate);
    setStartHour(nextHour);
    const duration = oldEnd - oldStart;
    if (Number.isNaN(nextStart) || Number.isNaN(duration) || duration <= 0) return;
    const nextEnd = new Date(nextStart + duration);
    setEndDate(datePart(nextEnd));
    setEndHour(hourPart(nextEnd));
  }
  function applyDays(days: number) {
    const start = combine(startDate, startHour, startMinute).getTime();
    if (Number.isNaN(start)) return;
    const nextEnd = new Date(start + days * 86_400_000);
    setEndDate(datePart(nextEnd));
    setEndHour(hourPart(nextEnd));
  }
  // Hàng (không gồm phí vận chuyển). Phí giao/thu hồi tính riêng ở dưới.
  const [cart, setCart] = useState<CartLine[]>([]);
  // Phí giao + thu hồi (CEO 2026-10-04): null = TỰ ĐỘNG theo hàng — món nào
  // vượt ngưỡng xe máy (ship_bike_max_qty, 0 = cồng kềnh) thì ô tô, còn lại xe
  // máy. Bấm chọn tay thì thôi tự động. Lên đơn web khách nhận tại kho → không phí.
  const [manualTransport, setManualTransport] = useState<string[] | null>(
    prefill && !prefill.ship ? [] : null,
  );
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [employeeId, setEmployeeId] = useState("");
  // "Thêm chi tiết"
  // Trống = server tự đánh số nối tiếp Booqable (PO13111…); gõ tay vẫn được.
  const [orderCode, setOrderCode] = useState("");
  const [returnBranchId, setReturnBranchId] = useState("");
  const [ordererName, setOrdererName] = useState(prefill?.ordererName ?? "");
  const [ordererPhone, setOrdererPhone] = useState(prefill?.ordererPhone ?? "");
  const [ordererEmail, setOrdererEmail] = useState(prefill?.ordererEmail ?? "");
  // 3 ô giao hàng (CEO 2026-10-05) — tên/SĐT người nhận trống thì lấy người đặt.
  const [deliveryAddress, setDeliveryAddress] = useState(prefill?.deliveryAddress ?? "");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  // Trả hàng: mặc định giống lúc giao; tick "khác chỗ giao" mới hiện 3 ô.
  const [returnDiffers, setReturnDiffers] = useState(false);
  const [returnAddress, setReturnAddress] = useState("");
  const [returnName, setReturnName] = useState("");
  const [returnPhone, setReturnPhone] = useState("");
  const [orderDate, setOrderDate] = useState(() => datePart(new Date()));
  // Mở lại popup còn dữ liệu đơn chưa tạo → báo "đang tiếp tục đơn dở".
  const [resumedDraft, setResumedDraft] = useState(false);

  // Làm mới toàn bộ form (CEO 2026-10-05: tạo đơn nhanh xong, đơn sau bị dính
  // khách/hàng/người đặt của đơn trước — nút nổi luôn mounted, state không
  // tự mất). Giữ kho + người phụ trách (thường không đổi giữa các đơn).
  function resetForm() {
    const s0 = defaultRentalStart(new Date());
    const e0 = new Date(s0.getTime() + 86_400_000);
    setError(null);
    setCustomer(null);
    setCustomerKey((k) => k + 1);
    setStartDate(datePart(s0));
    setStartHour(hourPart(s0));
    setStartMinute(minutePart(s0));
    setEndDate(datePart(e0));
    setEndHour(hourPart(e0));
    setEndMinute(minutePart(e0));
    setLongTermOpen(false);
    setCart([]);
    setManualTransport(null);
    setQuery("");
    setShowResults(false);
    setOrderCode("");
    setReturnBranchId("");
    setOrdererName("");
    setOrdererPhone("");
    setOrdererEmail("");
    setDeliveryAddress("");
    setReceiverName("");
    setReceiverPhone("");
    setReturnDiffers(false);
    setReturnAddress("");
    setReturnName("");
    setReturnPhone("");
    setOrderDate(datePart(new Date()));
    setResumedDraft(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !prefill) setResumedDraft(cart.length > 0 || !!customer || !!ordererName.trim());
    if (!next || catalog) return;
    startLoading(async () => {
      let c: QuickOrderCatalog;
      try {
        c = await getQuickOrderCatalog();
      } catch {
        setError("Không tải được danh mục hàng — đóng popup rồi mở lại.");
        return;
      }
      setCatalog(c);
      setEmployeeId((v) => v || c.currentEmployeeId);
      setBranchId((v) => v || c.defaultBranchId || branches[0]?.id || "");
      if (prefill) {
        // Dòng web → mục danh mục: biến thể riêng (u-) nếu có, không thì loại hàng (t-).
        const byKey = new Map(c.items.map((i) => [i.key, i]));
        const lines: CartLine[] = [];
        for (const it of prefill.items) {
          const item = (it.unitId && byKey.get(`u-${it.unitId}`)) || byKey.get(`t-${it.typeId}`);
          if (item) lines.push({ item, quantity: it.quantity });
        }
        setCart(lines);
      }
    });
  }

  const startAt = useMemo(() => combine(startDate, startHour, startMinute), [startDate, startHour, startMinute]);
  // Ngày giờ nhận + trả luôn hiện sẵn (CEO 2026-10-05: bỏ ô chọn nhanh 1 ngày/2 ngày...).
  const endAt = useMemo(() => combine(endDate, endHour, endMinute), [endDate, endHour, endMinute]);
  const periodValid = endAt > startAt;
  const dayCount = periodValid
    ? computeRentalDurationInUnit(startAt.toISOString(), endAt.toISOString(), "day")
    : 0;
  // Chip "chọn nhanh" sáng khi khoảng thuê đúng bội số ngày tròn.
  const activeDays = periodValid && dayCount > 0 && (endAt.getTime() - startAt.getTime()) % 86_400_000 === 0 ? dayCount : null;
  const commitMonths = LONG_TERM.find((l) => l.days === activeDays)?.months ?? null;
  const [longTermOpen, setLongTermOpen] = useState(false);
  const longTermActive = longTermOpen || commitMonths !== null;

  function linePrice(line: CartLine): number | null {
    if (!catalog || !periodValid) return null;
    const { item } = line;
    try {
      return computeOrderLinePrice({
        productType: item.productType as ProductType,
        price: item.price,
        rentalPeriodUnit: item.rentalPeriodUnit as RentalPeriodUnit | null,
        pricingMethod: item.pricingMethod as PricingMethod | null,
        tiers: item.templateId ? (catalog.tiersByTemplate[item.templateId] ?? []) : [],
        rentalStartAt: startAt.toISOString(),
        rentalEndAt: endAt.toISOString(),
        quantity: line.quantity,
        durationOverride: isHourlyService(item) ? (line.hours ?? 1) : null,
      }).lineTotal;
    } catch {
      return null;
    }
  }
  const needsCar = cart.some(
    (l) => l.item.productType === "rental" && l.quantity > (l.item.bikeMaxQty ?? DEFAULT_BIKE_MAX_QTY),
  );
  const hasRental = cart.some((l) => l.item.productType === "rental");
  const autoTransport = hasRental
    ? needsCar
      ? [CAR_DELIVERY_ID, CAR_COLLECTION_ID]
      : [BIKE_DELIVERY_ID, BIKE_COLLECTION_ID]
    : [];
  const transportIds = manualTransport ?? autoTransport;
  const transportLines: CartLine[] = transportIds.flatMap((id) => {
    const item = catalog?.items.find((i) => i.key === `t-${id}`);
    return item ? [{ item, quantity: 1 }] : [];
  });
  const allLines = [...cart, ...transportLines];
  const missing = [
    !customerId && "khách hàng",
    !branchId && "kho giao",
    !periodValid && "thời gian trả sau thời gian nhận",
    cart.length === 0 && "hàng thuê",
  ].filter((x): x is string => !!x);
  const prices = allLines.map(linePrice);
  const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!catalog || !q) return [];
    const words = q.split(/\s+/);
    return catalog.items.filter((i) => words.every((w) => fold(i.label).includes(w))).slice(0, 15);
  }, [catalog, query]);

  const transportItems = useMemo(
    () => (catalog?.items ?? []).filter((i) => i.typeId in TRANSPORT_LABELS),
    [catalog],
  );

  function freeAt(item: QuickOrderCatalogItem): number | null {
    return item.freeByBranch ? (item.freeByBranch[branchId] ?? 0) : null;
  }

  function addItem(item: QuickOrderCatalogItem) {
    if (item.typeId in TRANSPORT_LABELS) {
      if (!transportIds.includes(item.typeId)) toggleTransport(item);
      setQuery("");
      setShowResults(false);
      return;
    }
    setCart((c) => {
      const idx = c.findIndex((l) => l.item.key === item.key);
      if (idx >= 0) return c.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { item, quantity: 1, hours: isHourlyService(item) ? 1 : undefined }];
    });
    setQuery("");
    setShowResults(false);
  }
  function setHours(key: string, hours: number) {
    setCart((c) => c.map((l) => (l.item.key === key ? { ...l, hours: Math.max(0.5, hours) } : l)));
  }
  function setQty(key: string, quantity: number) {
    setCart((c) =>
      quantity <= 0 ? c.filter((l) => l.item.key !== key) : c.map((l) => (l.item.key === key ? { ...l, quantity } : l)),
    );
  }
  function toggleTransport(item: QuickOrderCatalogItem) {
    setManualTransport(
      transportIds.includes(item.typeId)
        ? transportIds.filter((id) => id !== item.typeId)
        : [...transportIds, item.typeId],
    );
  }

  function submit(stage: "quote" | "deal") {
    setError(null);
    if (!customerId) return setError("Chọn khách hàng trước.");
    if (!branchId) return setError("Chọn kho giao.");
    if (!periodValid) return setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
    startSaving(async () => {
      const result = await quickCreateOrder({
        customer_id: customerId,
        pickup_branch_id: branchId,
        return_branch_id: returnBranchId || null,
        rental_start_at: startAt.toISOString(),
        rental_end_at: endAt.toISOString(),
        order_code: orderCode.trim() || null,
        order_date: orderDate,
        orderer_name: ordererName || null,
        orderer_phone: ordererPhone || null,
        orderer_email: ordererEmail || null,
        delivery_address: deliveryAddress || null,
        receiver_name: receiverName || ordererName || null,
        receiver_phone: receiverPhone || ordererPhone || null,
        return_address: returnDiffers ? returnAddress || null : null,
        return_contact_name: returnDiffers ? returnName || null : null,
        return_contact_phone: returnDiffers ? returnPhone || null : null,
        employee_id: employeeId,
        stage,
        web_order_id: prefill?.webOrderId ?? null,
        items: allLines.map((l) => ({
          typeId: l.item.typeId,
          unitId: l.item.unitId,
          quantity: l.quantity,
          chargeDuration: isHourlyService(l.item) ? (l.hours ?? 1) : null,
        })),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      for (const w of result.warnings) toast.warning(w, { duration: 10_000 });
      toast.success(stage === "deal" ? "Đã tạo và chốt đơn" : "Đã tạo đơn");
      setOpen(false);
      // Đơn sau bắt đầu trắng + nạp lại danh mục (số máy trống đã đổi).
      if (!prefill) {
        resetForm();
        setCatalog(null);
      }
      router.push(`/orders/${result.orderId}`);
    });
  }

  const employees = catalog?.employees ?? [];
  const sortedEmployees = [
    ...employees.filter((e) => e.branch_id === branchId),
    ...employees.filter((e) => e.branch_id !== branchId),
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <Plus className="size-4" />
              Tạo đơn nhanh
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{prefill ? "Lên đơn từ đơn web" : "Tạo đơn nhanh"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {resumedDraft && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span>Đang tiếp tục đơn làm dở lần trước (chưa tạo).</span>
              <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                Bắt đầu đơn mới
              </Button>
            </div>
          )}
          {/* Khách + kho */}
          <Section n={1} title="Khách hàng & kho giao" tone="blue" icon={<UserRound />}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>
                Khách hàng
                <Req />
              </Label>
              <CustomerCombobox
                key={customerKey}
                name="quick_customer_id"
                defaultCustomer={customer ?? undefined}
                onChange={(id) => setCustomer(id ? { id, name: "" } : null)}
              />
              {prefill && !customer && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={creatingCustomer}
                  onClick={() =>
                    startCreatingCustomer(async () => {
                      const r = await createCustomerFromWebOrder(prefill.webOrderId);
                      if ("error" in r) return setError(r.error);
                      setCustomer(r);
                      setCustomerKey((k) => k + 1);
                      toast.success(`Đã tạo khách ${r.name}`);
                    })
                  }
                >
                  {creatingCustomer ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Tạo khách mới từ thông tin khách điền trên web
                </Button>
              )}
              {prefill?.customer && customer?.id === prefill.customer.id && (
                <p className="text-xs text-muted-foreground">Khớp khách cũ theo MST/SĐT — đổi nếu sai.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Kho giao
                <Req />
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => (
                  <Button
                    key={b.id}
                    type="button"
                    variant={branchId === b.id ? "default" : "outline"}
                    className={cn("h-10 px-4 text-sm", branchId !== b.id && "bg-background")}
                    onClick={() => setBranchId(b.id)}
                  >
                    {b.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          </Section>

          {/* Thời gian */}
          <Section n={2} title="Thời gian thuê" tone="amber" icon={<CalendarClock />}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Chọn nhanh</span>
              {QUICK_DAYS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={activeDays === d ? "default" : "outline"}
                  className={cn("h-9 rounded-full px-3.5", activeDays !== d && "bg-background")}
                  onClick={() => applyDays(d)}
                >
                  {d === 30 ? "1 tháng" : `${d} ngày`}
                </Button>
              ))}
              <Button
                type="button"
                variant={longTermActive ? "default" : "outline"}
                className={cn("h-9 rounded-full px-3.5", !longTermActive && "bg-background")}
                aria-expanded={longTermActive}
                onClick={() => {
                  if (!longTermActive) applyDays(LONG_TERM[0].days);
                  setLongTermOpen(true);
                }}
              >
                Thuê dài hạn
              </Button>
            </div>
            {longTermActive && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-medium text-muted-foreground">Cam kết</span>
                {LONG_TERM.map((l) => (
                  <Button
                    key={l.months}
                    type="button"
                    variant={commitMonths === l.months ? "default" : "outline"}
                    className={cn("h-9 rounded-full px-3.5", commitMonths !== l.months && "bg-background")}
                    onClick={() => applyDays(l.days)}
                  >
                    {l.months} tháng
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground">= {commitMonths ? commitMonths * 30 : LONG_TERM[0].days} ngày, giá bậc tháng tự áp</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">
                  Nhận
                  <Req />
                </span>
                <DateInput
                  id="quick_start_date"
                  value={startDate}
                  onChange={(e) => changeStart(e.target.value, startHour)}
                  className="w-40"
                />
                <HourSelect value={startHour} onChange={(h) => changeStart(startDate, h)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">
                  Trả
                  <Req />
                </span>
                <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                <HourSelect value={endHour} onChange={setEndHour} />
              </div>
            </div>
            <p className={cn("text-xs", periodValid ? "text-muted-foreground" : "text-destructive")}>
              {periodValid
                ? `Trả: ${endAt.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · tính ${dayCount} ngày`
                : "Thời gian kết thúc phải sau thời gian bắt đầu."}
            </p>
          </div>
          </Section>

          {/* Hàng */}
          <Section n={3} title={<>Hàng thuê<Req /></>} tone="emerald" icon={<Package />} hint="Ít nhất 1 dòng · gõ tên, Enter chọn dòng đầu">
          <div className="space-y-2">
            {!catalog ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Đang tải danh mục hàng…
              </p>
            ) : (
              <>
                <div
                  ref={searchRef}
                  className="relative"
                  onBlur={(e) => {
                    if (!searchRef.current?.contains(e.relatedTarget as Node)) setShowResults(false);
                  }}
                >
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && results[0]) {
                        e.preventDefault();
                        addItem(results[0]);
                      }
                    }}
                    placeholder="Gõ tên hàng (vd: ipad gen 9, loa jbl) rồi chọn"
                    className="h-11 bg-background pl-9 text-base"
                  />
                  {showResults && results.length > 0 && (
                    <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                      {results.map((item) => {
                        const free = freeAt(item);
                        return (
                          <li key={item.key}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                              onClick={() => addItem(item)}
                            >
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- ảnh Supabase storage, cùng convention ô thêm nhanh
                                <img src={item.imageUrl} alt="" className="size-7 shrink-0 rounded object-contain" />
                              ) : (
                                <span className="size-7 shrink-0" />
                              )}
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {free !== null && (
                                <span className={cn("shrink-0 text-xs", free > 0 ? "text-muted-foreground" : "text-destructive")}>
                                  còn {free} máy
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {transportItems.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Truck className="size-4 text-muted-foreground" />
                    {manualTransport === null && hasRental && (
                      <span className="text-xs text-muted-foreground">
                        Tự động: {needsCar ? "ô tô (có món cồng kềnh / số lượng lớn)" : "xe máy (hàng nhỏ gọn)"} ·
                      </span>
                    )}
                    {transportItems.map((item) => {
                      const on = transportIds.includes(item.typeId);
                      return (
                        <Button
                          key={item.key}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() => toggleTransport(item)}
                        >
                          {TRANSPORT_LABELS[item.typeId] ?? item.label}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {allLines.length > 0 && (
                  <div className="divide-y rounded-lg border bg-background">
                    {allLines.map((line, i) => {
                      const isTransport = line.item.typeId in TRANSPORT_LABELS;
                      const free = freeAt(line.item);
                      const short = free !== null && line.quantity > free;
                      return (
                        <div key={line.item.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{line.item.label}</p>
                            {short && (
                              <p className="text-xs text-destructive">
                                Kho đang có {free} máy trống — máy về kịp trước ngày thuê sẽ được tính; còn thiếu thì
                                hệ thống thêm máy tạm &quot;CHỜ MUA&quot; để vẫn lên được đơn.
                              </p>
                            )}
                          </div>
                          {isHourlyService(line.item) && (
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Input
                                type="number"
                                min={0.5}
                                step={0.5}
                                value={line.hours ?? 1}
                                onChange={(e) => setHours(line.item.key, Number(e.target.value) || 1)}
                                className="h-9 w-16 text-center text-base"
                                aria-label="Số giờ thực hiện"
                              />
                              {HOUR_UNIT_LABELS[line.item.rentalPeriodUnit!] ?? line.item.rentalPeriodUnit} ×
                            </label>
                          )}
                          <div className={cn("flex items-center gap-1", isTransport && "invisible")}>
                            <Button type="button" size="icon" variant="outline" className="size-9 rounded-full" onClick={() => setQty(line.item.key, line.quantity - 1)}>
                              <Minus className="size-4" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) => setQty(line.item.key, Math.max(1, Number(e.target.value) || 1))}
                              className="h-9 w-14 text-center text-base"
                            />
                            <Button type="button" size="icon" variant="outline" className="size-9 rounded-full" onClick={() => setQty(line.item.key, line.quantity + 1)}>
                              <Plus className="size-4" />
                            </Button>
                          </div>
                          <span className="w-28 text-right tabular-nums">
                            {prices[i] === null ? "—" : vnd(prices[i]!)}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => (isTransport ? toggleTransport(line.item) : setQty(line.item.key, 0))}
                          >
                            <X className="size-3.5" />
                            <span className="sr-only">Bỏ</span>
                          </Button>
                        </div>
                      );
                    })}
                    <div className="flex items-baseline justify-between bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/40">
                      <span className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                        Tạm tính (chưa VAT, chưa giảm giá)
                        {commitMonths && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            gói {commitMonths} tháng ≈ {vnd(Math.round(total / commitMonths))}/tháng
                          </span>
                        )}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{vnd(total)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          </Section>

          {/* Chi tiết luôn mở sẵn (CEO 2026-10-05: không ẩn mã đơn, người đặt). */}
          <Section n={4} title="Chi tiết đơn & giao nhận" tone="violet" icon={<ClipboardList />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick_order_code">Mã đơn</Label>
                <Input
                  id="quick_order_code"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="Tự đánh số tiếp theo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_return_branch">Kho thu hồi</Label>
                <select
                  id="quick_return_branch"
                  value={returnBranchId}
                  onChange={(e) => setReturnBranchId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">Giống kho giao</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_orderer_name">Người đặt hàng</Label>
                <OrdererSuggestInput
                  id="quick_orderer_name"
                  value={ordererName}
                  onChange={(e) => setOrdererName(e.target.value)}
                  placeholder="Gõ tên/SĐT để tìm"
                  onPick={(o) => {
                    setOrdererName(o.name);
                    setOrdererPhone(o.phone ?? "");
                    setOrdererEmail(o.email ?? "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_orderer_phone">SĐT người đặt</Label>
                <OrdererSuggestInput
                  id="quick_orderer_phone"
                  value={ordererPhone}
                  onChange={(e) => setOrdererPhone(e.target.value)}
                  placeholder="Không bắt buộc"
                  onPick={(o) => {
                    setOrdererName(o.name);
                    setOrdererPhone(o.phone ?? "");
                    setOrdererEmail(o.email ?? "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_orderer_email">Email người đặt</Label>
                <Input id="quick_orderer_email" type="email" value={ordererEmail} onChange={(e) => setOrdererEmail(e.target.value)} placeholder="Không bắt buộc" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="quick_delivery_address">Địa chỉ nhận hàng</Label>
                <Input
                  id="quick_delivery_address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Để trống = khách tự đến kho lấy"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_receiver_name">Tên người nhận</Label>
                <Input
                  id="quick_receiver_name"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder={ordererName || "Trống = người đặt"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_receiver_phone">SĐT người nhận</Label>
                <Input
                  id="quick_receiver_phone"
                  inputMode="tel"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  placeholder={ordererPhone || "Trống = SĐT người đặt"}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={returnDiffers} onChange={(e) => setReturnDiffers(e.target.checked)} />
                Trả hàng khác chỗ/người giao
              </label>
              {returnDiffers && (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="quick_return_address">Địa chỉ trả hàng</Label>
                    <Input
                      id="quick_return_address"
                      value={returnAddress}
                      onChange={(e) => setReturnAddress(e.target.value)}
                      placeholder={deliveryAddress || "Trống = như địa chỉ nhận hàng"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_return_name">Tên người trả hàng</Label>
                    <Input
                      id="quick_return_name"
                      value={returnName}
                      onChange={(e) => setReturnName(e.target.value)}
                      placeholder={receiverName || ordererName || "Trống = người nhận"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_return_phone">SĐT người trả hàng</Label>
                    <Input
                      id="quick_return_phone"
                      inputMode="tel"
                      value={returnPhone}
                      onChange={(e) => setReturnPhone(e.target.value)}
                      placeholder={receiverPhone || ordererPhone || "Trống = SĐT người nhận"}
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="quick_order_date">Ngày đơn</Label>
                <DateInput id="quick_order_date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
            </div>
          </Section>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="sticky -bottom-4 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-popover px-4 py-3">
            <Label htmlFor="quick_employee" className="text-sm font-normal text-muted-foreground">
              Người phụ trách
            </Label>
            <select
              id="quick_employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              {sortedEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <div className="ml-auto flex flex-wrap items-start gap-2">
              <Button type="button" variant="ghost" className="h-10" disabled={saving} onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <div className="flex flex-col items-center gap-0.5">
                <Button type="button" variant="outline" className="h-10" disabled={saving || !catalog} onClick={() => submit("quote")}>
                  Tạo đơn (đã báo giá)
                </Button>
                <span className="text-[11px] text-muted-foreground">Trạng thái Đã báo giá, chưa chốt</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Button type="button" className="h-10 px-5 text-base" disabled={saving || !catalog} onClick={() => submit("deal")}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Tạo &amp; chốt đơn
                </Button>
                <span className="text-[11px] text-muted-foreground">Trạng thái Chốt đơn, bước 1/7</span>
              </div>
            </div>
            {/* Còn thiếu gì để tạo đơn — hiện ngay, khỏi bấm rồi mới báo lỗi. */}
            <p className={cn("basis-full text-xs", missing.length ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
              {missing.length ? `Còn thiếu: ${missing.join(", ")}` : "Đủ thông tin để tạo đơn"}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
