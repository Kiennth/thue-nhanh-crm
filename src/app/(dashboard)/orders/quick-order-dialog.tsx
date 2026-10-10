"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronRight, FileText, Loader2, Minus, Package, Plus, Search, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/create-button";
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
  findApplicableTier,
} from "@/lib/rental-pricing";
import { cn } from "@/lib/utils";
import type { PricingMethod, ProductType, RentalPeriodUnit } from "@/types/database";
import { createCustomerFromWebOrder } from "@/lib/actions/website-orders";
import { getCustomerOrderDefaults, type CustomerOrderDefaults } from "@/lib/actions/customers";
import { CustomerCombobox } from "./customer-combobox";
import { DateInput } from "@/components/date-input";
import { OrdererSuggestInput } from "@/components/orderer-suggest-input";

// Popup "Tạo đơn" (CEO 2026-10-03; luồng 3 bước Grok CRM 09/10 §C): 1 Khách
// hàng (chọn khách → tự điền người đặt/SĐT/địa chỉ, kho giao mặc định theo kho
// người dùng) · 2 Thời gian (chip 1/2/3… ngày) · 3 Hàng thuê (danh mục tải
// sẵn, phí giao/thu hồi tự thêm thành dòng có nút Bỏ). Ô ít dùng gập trong
// "Thêm chi tiết". Chân: "Tạo báo giá" / "Tạo & chốt đơn" — tồn kho và thiếu
// CCCD chỉ cảnh báo, không bao giờ chặn.

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

// Bộ nhớ đệm danh mục dùng chung mọi popup Tạo đơn (nút nổi, trang Đơn hàng,
// Đơn web) — Grok CRM 09/10 §A.3-4: tải sẵn khi trình duyệt rảnh, mở popup là
// có ngay; cũ hơn 5 phút thì vẫn hiện bản cũ và làm mới ở nền. Tạo đơn xong
// thì xoá cache (số máy rảnh đã đổi).
const CATALOG_TTL_MS = 5 * 60_000;
let catalogCache: { at: number; data: QuickOrderCatalog } | null = null;
let catalogInflight: Promise<QuickOrderCatalog> | null = null;

function loadCatalog(): Promise<QuickOrderCatalog> {
  catalogInflight ??= getQuickOrderCatalog()
    .then((data) => {
      catalogCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      catalogInflight = null;
    });
  return catalogInflight;
}

// Giờ nhận mặc định (Grok CRM 09/10 §C1): giờ tròn kế tiếp hôm nay; sau 17:00
// thì 08:00 sáng mai, trước 07:00 (tạo đơn lúc rạng sáng) thì 08:00 hôm nay.
function defaultQuickStart(now: Date): Date {
  const d = new Date(now);
  if (d.getHours() >= 17) {
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  }
  if (d.getHours() < 7) {
    d.setHours(8, 0, 0, 0);
    return d;
  }
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

// Phí giao/thu hồi tự thêm theo loại (giao | thu hồi) — bấm "Bỏ" là bỏ hẳn loại
// đó trong lần tạo này, đổi xe máy ↔ ô tô cũng không tự thêm lại (§C5).
const FEE_KIND: Record<string, "delivery" | "collection"> = {
  [BIKE_DELIVERY_ID]: "delivery",
  [CAR_DELIVERY_ID]: "delivery",
  [BIKE_COLLECTION_ID]: "collection",
  [CAR_COLLECTION_ID]: "collection",
};
const FEE_LONG_LABEL: Record<string, string> = {
  [BIKE_DELIVERY_ID]: "phí giao xe máy",
  [BIKE_COLLECTION_ID]: "phí thu hồi xe máy",
  [CAR_DELIVERY_ID]: "phí giao ô tô",
  [CAR_COLLECTION_ID]: "phí thu hồi ô tô",
};

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
  // Tải sẵn danh mục khi trình duyệt rảnh (1 lần / 5 phút cho cả phiên).
  useEffect(() => {
    if (catalogCache || catalogInflight) return;
    const run = () => void loadCatalog().catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, []);
  const [, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  // Bấm 2 lần liền không tạo 2 đơn.
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(prefill?.customer ?? null);
  const customerId = customer?.id ?? null;
  // Hồ sơ khách để tự điền (§C1) + cờ thiếu CCCD (B6: chỉ cảnh báo, KHÔNG chặn).
  const [defaults, setDefaults] = useState<{ id: string; data: CustomerOrderDefaults } | null>(null);
  const customerDefaults = defaults && defaults.id === customerId ? defaults.data : null;
  const missingCccd = !!customerDefaults?.missingCccd;
  // Giá trị lần tự điền trước — đổi khách thì chỉ thay ô còn trống hoặc còn
  // đúng giá trị tự điền cũ, ô nhân viên đã sửa tay thì giữ.
  const lastAuto = useRef({ name: "", phone: "", email: "", address: "" });
  const [editContact, setEditContact] = useState(false);
  const [customerKey, setCustomerKey] = useState(0);
  const [creatingCustomer, startCreatingCustomer] = useTransition();
  const [branchId, setBranchId] = useState<string>(prefill?.branchId ?? "");
  const [start] = useState(() => (prefill ? new Date(prefill.startAt) : defaultQuickStart(new Date())));
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
    setEndMinute(startMinute);
  }
  // Hàng (không gồm phí vận chuyển). Phí giao/thu hồi tính riêng ở dưới.
  const [cart, setCart] = useState<CartLine[]>([]);
  // Giao tận nơi / khách tự lấy tại kho. Lên đơn web khách nhận tại kho → tự lấy.
  const [selfPickup, setSelfPickup] = useState(() => !!prefill && !prefill.ship);
  // Phí tự thêm đã bấm "Bỏ" (theo loại) + phí thêm tay qua "+ Thêm phí".
  const [dismissedFees, setDismissedFees] = useState<("delivery" | "collection")[]>([]);
  const [extraFees, setExtraFees] = useState<string[]>([]);
  const [feeMenuOpen, setFeeMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const [employeeId, setEmployeeId] = useState("");
  // "Thêm chi tiết" — đóng sẵn, để trống = server dùng mặc định (§C3).
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Trống = server tự đánh số nối tiếp Booqable (PO13111…); gõ tay vẫn được.
  const [orderCode, setOrderCode] = useState("");
  const [returnBranchId, setReturnBranchId] = useState("");
  const [ordererName, setOrdererName] = useState(prefill?.ordererName ?? "");
  const [ordererPhone, setOrdererPhone] = useState(prefill?.ordererPhone ?? "");
  const [ordererEmail, setOrdererEmail] = useState(prefill?.ordererEmail ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(prefill?.deliveryAddress ?? "");
  // Một ô "Người nhận khác" thay 6 ô người nhận + trả khác chỗ (§C3): bỏ trống
  // = người đặt nhận tại địa chỉ giao.
  const [otherReceiver, setOtherReceiver] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [returnDiffers, setReturnDiffers] = useState(false);
  const [returnAddress, setReturnAddress] = useState("");
  const [returnName, setReturnName] = useState("");
  const [returnPhone, setReturnPhone] = useState("");
  const [orderDate, setOrderDate] = useState(() => datePart(new Date()));
  // Mở lại popup còn dữ liệu đơn chưa tạo → báo "đang tiếp tục đơn dở".
  const [resumedDraft, setResumedDraft] = useState(false);

  // Chọn khách → nạp hồ sơ: tự điền người đặt, SĐT, email, địa chỉ giao.
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    void getCustomerOrderDefaults(customerId)
      .then((d) => {
        if (!alive || !d) return;
        setDefaults({ id: customerId, data: d });
        const prev = lastAuto.current;
        const take = (current: string, old: string, next: string) =>
          !current.trim() || current === old ? next : current;
        setOrdererName((v) => take(v, prev.name, d.ordererName));
        setOrdererPhone((v) => take(v, prev.phone, d.ordererPhone));
        setOrdererEmail((v) => take(v, prev.email, d.ordererEmail));
        setDeliveryAddress((v) => take(v, prev.address, d.deliveryAddress));
        lastAuto.current = {
          name: d.ordererName,
          phone: d.ordererPhone,
          email: d.ordererEmail,
          address: d.deliveryAddress,
        };
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customerId]);

  // Làm mới toàn bộ form (CEO 2026-10-05: tạo đơn nhanh xong, đơn sau bị dính
  // khách/hàng/người đặt của đơn trước — nút nổi luôn mounted, state không
  // tự mất). Giữ kho + người phụ trách (thường không đổi giữa các đơn).
  function resetForm() {
    const s0 = defaultQuickStart(new Date());
    const e0 = new Date(s0.getTime() + 86_400_000);
    setError(null);
    setCustomer(null);
    setDefaults(null);
    lastAuto.current = { name: "", phone: "", email: "", address: "" };
    setEditContact(false);
    setCustomerKey((k) => k + 1);
    setStartDate(datePart(s0));
    setStartHour(hourPart(s0));
    setStartMinute(minutePart(s0));
    setEndDate(datePart(e0));
    setEndHour(hourPart(e0));
    setEndMinute(minutePart(e0));
    setLongTermOpen(false);
    setCart([]);
    setSelfPickup(false);
    setDismissedFees([]);
    setExtraFees([]);
    setQuery("");
    setShowResults(false);
    setDetailsOpen(false);
    setOrderCode("");
    setReturnBranchId("");
    setOrdererName("");
    setOrdererPhone("");
    setOrdererEmail("");
    setDeliveryAddress("");
    setOtherReceiver(false);
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
    if (!next) return;
    const applyCatalog = (c: QuickOrderCatalog, first: boolean) => {
      setCatalog(c);
      if (!first) return;
      setEmployeeId((v) => v || c.currentEmployeeId);
      // Kho giao mặc định = kho của người đang đăng nhập (§C1, đã chốt);
      // người không gắn kho thì để trống, bắt chọn.
      setBranchId((v) => v || c.defaultBranchId || "");
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
    };
    const first = !catalog;
    const cached = catalogCache;
    // Có bản đệm: hiện ngay; còn mới thì thôi, cũ thì làm mới ở nền.
    if (cached && first) applyCatalog(cached.data, true);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return;
    if (!first && !cached) return;
    startLoading(async () => {
      let c: QuickOrderCatalog;
      try {
        c = await loadCatalog();
      } catch {
        if (!cached && first) setError("Không tải được danh mục hàng — đóng popup rồi mở lại.");
        return;
      }
      applyCatalog(c, first && !cached);
    });
  }

  const startAt = useMemo(() => combine(startDate, startHour, startMinute), [startDate, startHour, startMinute]);
  const endAt = useMemo(() => combine(endDate, endHour, endMinute), [endDate, endHour, endMinute]);
  const periodValid = endAt > startAt;
  const dayCount = periodValid
    ? computeRentalDurationInUnit(startAt.toISOString(), endAt.toISOString(), "day")
    : 0;
  // Chip "chọn nhanh" sáng khi khoảng thuê đúng bội số ngày tròn — sửa Trả
  // bằng tay lệch giờ là tự bỏ chọn.
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
  // "Tính N ngày · giá theo bậc X" — bậc của món thuê theo ngày đầu tiên có bảng giá mẫu.
  const tierItem = cart.find((l) => l.item.productType === "rental" && l.item.templateId && l.item.rentalPeriodUnit === "day");
  const appliedTier =
    catalog && tierItem && dayCount > 0
      ? findApplicableTier(catalog.tiersByTemplate[tierItem.item.templateId!] ?? [], "day", dayCount)
      : null;
  const tierText = appliedTier
    ? `giá theo bậc ${appliedTier.min_duration} ${HOUR_UNIT_LABELS[appliedTier.duration_unit] ?? appliedTier.duration_unit} (−${appliedTier.discount_percentage}%)`
    : tierItem
      ? "giá ngày thường"
      : null;

  // Phí giao/thu hồi tự thêm (§C5): có hàng thuê + giao tận nơi → món nào vượt
  // ngưỡng xe máy (ship_bike_max_qty, 0 = cồng kềnh) thì ô tô, còn lại xe máy
  // (quy tắc cũ, giữ nguyên). Loại đã "Bỏ" thì không tự thêm lại.
  const needsCar = cart.some(
    (l) => l.item.productType === "rental" && l.quantity > (l.item.bikeMaxQty ?? DEFAULT_BIKE_MAX_QTY),
  );
  const hasRental = cart.some((l) => l.item.productType === "rental");
  const autoFeeIds =
    hasRental && !selfPickup
      ? (needsCar ? [CAR_DELIVERY_ID, CAR_COLLECTION_ID] : [BIKE_DELIVERY_ID, BIKE_COLLECTION_ID]).filter(
          (id) => !dismissedFees.includes(FEE_KIND[id]),
        )
      : [];
  const transportIds = [...autoFeeIds, ...extraFees.filter((id) => !autoFeeIds.includes(id))];
  const transportLines: CartLine[] = transportIds.flatMap((id) => {
    const item = catalog?.items.find((i) => i.key === `t-${id}`);
    return item ? [{ item, quantity: 1 }] : [];
  });
  const allLines = [...cart, ...transportLines];
  const missing = [
    !customerId && "Khách hàng",
    !branchId && "Kho giao",
    !periodValid && "Trả phải sau Nhận",
    cart.length === 0 && "Hàng thuê",
    otherReceiver && !receiverName.trim() && "Tên người nhận",
    otherReceiver && !receiverPhone.trim() && "SĐT người nhận",
  ].filter((x): x is string => !!x);
  const prices = allLines.map(linePrice);
  const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
  // Cọc theo hàng × % cọc của khách, làm tròn 100.000đ — cùng công thức trang đơn.
  const rawDeposit = cart.reduce((s, l) => s + (l.item.deposit ?? 0) * l.quantity, 0);
  const deposit =
    Math.round((rawDeposit * (customerDefaults?.depositPercentage ?? 100)) / 100 / 100_000) * 100_000;

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

  function addFee(typeId: string) {
    if (!transportIds.includes(typeId)) setExtraFees((f) => [...f, typeId]);
    setFeeMenuOpen(false);
  }
  function removeFee(typeId: string) {
    if (autoFeeIds.includes(typeId)) setDismissedFees((d) => [...d, FEE_KIND[typeId]]);
    setExtraFees((f) => f.filter((id) => id !== typeId));
  }

  function addItem(item: QuickOrderCatalogItem) {
    if (item.typeId in TRANSPORT_LABELS) {
      addFee(item.typeId);
    } else {
      setCart((c) => {
        const idx = c.findIndex((l) => l.item.key === item.key);
        if (idx >= 0) return c.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
        return [...c, { item, quantity: 1, hours: isHourlyService(item) ? 1 : undefined }];
      });
    }
    setQuery("");
    setShowResults(false);
    setActiveIdx(0);
  }
  function setHours(key: string, hours: number) {
    setCart((c) => c.map((l) => (l.item.key === key ? { ...l, hours: Math.max(0.5, hours) } : l)));
  }
  function setQty(key: string, quantity: number) {
    setCart((c) =>
      quantity <= 0 ? c.filter((l) => l.item.key !== key) : c.map((l) => (l.item.key === key ? { ...l, quantity } : l)),
    );
  }

  function submit(stage: "quote" | "deal") {
    if (submittingRef.current) return;
    setError(null);
    if (missing.length) return setError(`Còn thiếu: ${missing.join(", ")}.`);
    submittingRef.current = true;
    startSaving(async () => {
      try {
        const result = await quickCreateOrder({
          customer_id: customerId!,
          pickup_branch_id: branchId,
          return_branch_id: returnBranchId || null,
          rental_start_at: startAt.toISOString(),
          rental_end_at: endAt.toISOString(),
          order_code: orderCode.trim() || null,
          order_date: orderDate,
          orderer_name: ordererName || null,
          orderer_phone: ordererPhone || null,
          orderer_email: ordererEmail || null,
          delivery_address: selfPickup ? null : deliveryAddress || null,
          receiver_name: (otherReceiver ? receiverName : "") || ordererName || null,
          receiver_phone: (otherReceiver ? receiverPhone : "") || ordererPhone || null,
          return_address: otherReceiver && returnDiffers ? returnAddress || null : null,
          return_contact_name: otherReceiver && returnDiffers ? returnName || null : null,
          return_contact_phone: otherReceiver && returnDiffers ? returnPhone || null : null,
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
        toast.success(stage === "deal" ? "Đã tạo và chốt đơn" : "Đã tạo báo giá");
        setOpen(false);
        // Đơn sau bắt đầu trắng + nạp lại danh mục (số máy trống đã đổi).
        catalogCache = null;
        if (!prefill) {
          resetForm();
          setCatalog(null);
        }
        router.push(`/orders/${result.orderId}`);
      } catch {
        setError("Mất kết nối khi tạo đơn — dữ liệu vẫn giữ nguyên, bấm tạo lại.");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  const employees = catalog?.employees ?? [];
  const sortedEmployees = [
    ...employees.filter((e) => e.branch_id === branchId),
    ...employees.filter((e) => e.branch_id !== branchId),
  ];
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "";
  // Dải "Tự điền từ hồ sơ khách" hay các ô sửa người đặt / địa chỉ giao.
  const showContactFields =
    editContact ||
    (!!prefill && !customerDefaults) ||
    (!!customerDefaults && !ordererName.trim() && !ordererPhone.trim() && !deliveryAddress.trim());
  const detailsSummary = [
    orderCode.trim() ? `Mã đơn ${orderCode.trim()}` : "Mã đơn tự sinh",
    orderDate === datePart(new Date()) ? "Ngày đơn hôm nay" : `Ngày đơn ${orderDate.split("-").reverse().join("/")}`,
    returnBranchId && returnBranchId !== branchId ? `Kho thu hồi ${branchName(returnBranchId)}` : "Kho thu hồi = Kho giao",
    selfPickup ? "Khách tự lấy tại kho" : "Giao tới địa chỉ",
    otherReceiver ? `Người nhận ${receiverName.trim() || "khác"}` : "Người nhận = người đặt",
  ].join(" · ");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ?? <CreateButton label="Tạo đơn" />
        }
      />
      <DialogContent
        className="max-h-[94vh] overflow-y-auto sm:max-w-3xl"
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter = Tạo báo giá (§C4). "Tạo & chốt đơn" cố ý không có phím tắt.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!saving && catalog) submit("quote");
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-3">
            {prefill ? "Lên đơn từ đơn web" : "Tạo đơn"}
            <span className="text-xs font-normal text-muted-foreground">
              <span className="text-destructive">*</span> bắt buộc · Esc: đóng · Ctrl+Enter: tạo báo giá
            </span>
          </DialogTitle>
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
          {/* Bước 1 · Khách + kho */}
          <Section n={1} title="Khách hàng" tone="blue" icon={<UserRound />}>
            <div className="space-y-3">
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
                  {missingCccd && customer && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                      Khách chưa có CCCD ·{" "}
                      <a href={`/customers/${customer.id}`} target="_blank" rel="noopener" className="font-semibold underline">
                        Bổ sung CCCD
                      </a>{" "}
                      (chỉ nhắc — vẫn tạo/chốt đơn được)
                    </p>
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
                  {catalog && branchId && branchId === catalog.defaultBranchId && (
                    <p className="text-[11px] text-muted-foreground">Mặc định kho của bạn</p>
                  )}
                </div>
              </div>

              {/* Tự điền từ hồ sơ khách (§C1) — "Đổi" mở ô sửa. */}
              {customer && customerDefaults && !showContactFields && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/40">
                  <span className="flex items-center gap-1 font-medium text-sky-800 dark:text-sky-200">
                    <Check className="size-4" /> {prefill ? "Theo đơn web" : "Tự điền từ hồ sơ khách"}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Người đặt</span> {ordererName || "—"}
                  </span>
                  <span>
                    <span className="text-muted-foreground">SĐT</span> {ordererPhone || "—"}
                  </span>
                  <span className="min-w-0">
                    {selfPickup ? (
                      <span className="text-muted-foreground">Khách tự lấy tại kho</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Giao tới</span>{" "}
                        {deliveryAddress || <span className="text-amber-700 dark:text-amber-300">chưa có địa chỉ</span>}
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-sm font-medium text-primary hover:underline"
                    onClick={() => setEditContact(true)}
                  >
                    Đổi
                  </button>
                </div>
              )}
              {showContactFields && (
                <div className="grid gap-3 rounded-md border bg-background/60 p-3 sm:grid-cols-2">
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
                      inputMode="tel"
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
                  {!!customerDefaults?.contacts.length && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                      <span className="text-xs text-muted-foreground">Người liên hệ khác:</span>
                      {customerDefaults.contacts.map((c) => (
                        <button
                          key={`${c.name}|${c.phone}`}
                          type="button"
                          className="rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-muted"
                          onClick={() => {
                            setOrdererName(c.name);
                            setOrdererPhone(c.phone);
                            setOrdererEmail(c.email);
                          }}
                        >
                          {c.name}
                          {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {!selfPickup && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="quick_delivery_address">Địa chỉ giao</Label>
                      <Input
                        id="quick_delivery_address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Số nhà, đường, phường, thành phố"
                      />
                    </div>
                  )}
                  {editContact && (
                    <button
                      type="button"
                      className="justify-self-start text-xs text-muted-foreground hover:underline"
                      onClick={() => setEditContact(false)}
                    >
                      Thu gọn
                    </button>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Bước 2 · Thời gian */}
          <Section n={2} title="Thời gian thuê" tone="amber" icon={<CalendarClock />} hint="Chọn nhanh hoặc nhập ngày">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
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
                  <span className="w-12 text-sm font-medium">
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
                  <span className="w-12 text-sm font-medium">
                    Trả
                    <Req />
                  </span>
                  <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                  <HourSelect value={endHour} onChange={setEndHour} />
                </div>
              </div>
              <p className={cn("text-xs", periodValid ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")}>
                {periodValid
                  ? `Trả ${endAt.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · Tính ${dayCount} ngày${tierText ? ` · ${tierText}` : ""}`
                  : "Trả phải sau Nhận."}
              </p>
            </div>
          </Section>

          {/* Bước 3 · Hàng */}
          <Section
            n={3}
            title={<>Hàng thuê<Req /></>}
            tone="emerald"
            icon={<Package />}
            hint={catalog ? `Danh mục sẵn sàng · ${catalog.items.length} mã · ↑↓ chọn, Enter thêm` : undefined}
          >
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
                        setActiveIdx(0);
                      }}
                      onFocus={() => setShowResults(true)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" && results.length) {
                          e.preventDefault();
                          setShowResults(true);
                          setActiveIdx((i) => Math.min(i + 1, results.length - 1));
                        } else if (e.key === "ArrowUp" && results.length) {
                          e.preventDefault();
                          setActiveIdx((i) => Math.max(i - 1, 0));
                        } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && results.length) {
                          e.preventDefault();
                          addItem(results[Math.min(activeIdx, results.length - 1)]);
                        } else if (e.key === "Escape" && showResults && query) {
                          e.stopPropagation();
                          setShowResults(false);
                        }
                      }}
                      placeholder="Tìm theo tên hàng (vd: ipad gen 9, loa jbl) · Enter chọn dòng đầu"
                      className="h-11 bg-background pl-9 text-base"
                    />
                    {showResults && query.trim() && (
                      <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                        {results.length === 0 && (
                          <li className="px-3 py-2 text-sm text-muted-foreground">
                            Không có “{query.trim()}” ·{" "}
                            <a href="/equipment" target="_blank" rel="noopener" className="text-primary hover:underline">
                              + Thêm hàng hoá
                            </a>
                          </li>
                        )}
                        {results.map((item, idx) => {
                          const free = freeAt(item);
                          return (
                            <li key={item.key}>
                              <button
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                                  idx === activeIdx && "bg-muted",
                                )}
                                onMouseEnter={() => setActiveIdx(idx)}
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
                                  <span className="shrink-0 text-xs text-muted-foreground">còn {free}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {allLines.length > 0 && (
                    <div className="space-y-1.5">
                      {allLines.map((line, i) => {
                        const isTransport = line.item.typeId in TRANSPORT_LABELS;
                        const free = freeAt(line.item);
                        const price = prices[i];
                        if (isTransport) {
                          const auto = autoFeeIds.includes(line.item.typeId);
                          return (
                            <div
                              key={line.item.key}
                              className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-400 bg-background px-3 py-2 text-sm dark:border-emerald-700"
                            >
                              <Truck className="size-4 shrink-0 text-muted-foreground" />
                              <p className="min-w-0 flex-1">
                                {auto ? (
                                  <>
                                    Tự thêm {FEE_LONG_LABEL[line.item.typeId]}{" "}
                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                                      tự động
                                    </span>{" "}
                                    <span className="text-xs text-muted-foreground">
                                      vì giao tận nơi{needsCar ? " · có món cồng kềnh / số lượng lớn → ô tô" : ""}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {TRANSPORT_LABELS[line.item.typeId] ?? line.item.label}{" "}
                                    <span className="text-xs text-muted-foreground">· thêm tay</span>
                                  </>
                                )}
                              </p>
                              <span className="w-28 text-right tabular-nums">{price === null ? "—" : vnd(price)}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive"
                                onClick={() => removeFee(line.item.typeId)}
                              >
                                Bỏ
                              </Button>
                            </div>
                          );
                        }
                        // Giá/ngày sau bậc (gạch giá gốc nếu có giảm) — chỉ hàng thuê theo ngày.
                        const perDay =
                          price !== null && line.item.productType === "rental" && line.item.rentalPeriodUnit === "day" && dayCount > 0
                            ? price / line.quantity / dayCount
                            : null;
                        return (
                          <div key={line.item.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                            <div className="min-w-[12rem] flex-1">
                              <p className="line-clamp-2 leading-snug">{line.item.label}</p>
                              {/* Tồn chỉ tham khảo — KHÔNG bao giờ chặn tạo đơn (§C, quy tắc chủ). */}
                              {free !== null && (
                                <span
                                  className={cn(
                                    "mt-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px]",
                                    line.quantity > free ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                                  )}
                                >
                                  {line.quantity > free ? `thiếu ${line.quantity - free}` : `còn ${free}`} · tham khảo
                                </span>
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
                            <div className="flex items-center gap-1">
                              <Button type="button" size="icon" variant="outline" className="size-8 rounded-full" onClick={() => setQty(line.item.key, line.quantity - 1)}>
                                <Minus className="size-4" />
                                <span className="sr-only">Bớt 1</span>
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => setQty(line.item.key, Math.max(1, Number(e.target.value) || 1))}
                                className="h-8 w-12 text-center text-base"
                                aria-label="Số lượng"
                              />
                              <Button type="button" size="icon" variant="outline" className="size-8 rounded-full" onClick={() => setQty(line.item.key, line.quantity + 1)}>
                                <Plus className="size-4" />
                                <span className="sr-only">Thêm 1</span>
                              </Button>
                            </div>
                            {perDay !== null && (
                              <span className="hidden w-36 text-right text-xs text-muted-foreground tabular-nums sm:inline">
                                {perDay < line.item.price - 1 && <s className="mr-1">{vnd(line.item.price)}</s>}
                                {vnd(perDay)}/ngày
                              </span>
                            )}
                            <span className="w-28 text-right font-medium tabular-nums">{price === null ? "—" : vnd(price)}</span>
                            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setQty(line.item.key, 0)}>
                              <X className="size-3.5" />
                              <span className="sr-only">Bỏ</span>
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {transportItems.length > 0 && (
                    <div className="relative flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 bg-background text-xs"
                        aria-expanded={feeMenuOpen}
                        onClick={() => setFeeMenuOpen((v) => !v)}
                      >
                        <Plus className="size-3.5" /> Thêm phí
                      </Button>
                      {feeMenuOpen &&
                        transportItems
                          .filter((item) => !transportIds.includes(item.typeId))
                          .map((item) => (
                            <Button
                              key={item.key}
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => addFee(item.typeId)}
                            >
                              {TRANSPORT_LABELS[item.typeId] ?? item.label}
                            </Button>
                          ))}
                      {cart.some((l) => freeAt(l.item) !== null) && (
                        <span className="basis-full">Tồn kho chỉ để tham khảo, không chặn tạo đơn.</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* Thêm chi tiết — đóng sẵn (§C3, đã chốt theo mockup). */}
          <section className="rounded-xl border border-violet-200 bg-violet-50/70 dark:border-violet-900/70 dark:bg-violet-950/30">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 p-3.5 text-left sm:p-4"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((v) => !v)}
            >
              <ChevronRight className={cn("size-4 shrink-0 text-violet-700 transition-transform dark:text-violet-300", detailsOpen && "rotate-90")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-violet-900 dark:text-violet-200">Thêm chi tiết</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {detailsOpen ? "Tất cả đều tuỳ chọn · để trống = dùng giá trị mặc định" : detailsSummary}
                </span>
              </span>
              <span className="text-sm font-medium text-primary">{detailsOpen ? "Thu gọn" : "Mở"}</span>
            </button>
            {detailsOpen && (
              <div className="space-y-3 border-t border-violet-200 p-3.5 sm:p-4 dark:border-violet-900/70">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_order_code">Mã đơn</Label>
                    <Input
                      id="quick_order_code"
                      value={orderCode}
                      onChange={(e) => setOrderCode(e.target.value)}
                      placeholder="Tự sinh khi lưu"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_order_date">Ngày đơn</Label>
                    <DateInput id="quick_order_date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_orderer_email">Email người đặt</Label>
                    <Input
                      id="quick_orderer_email"
                      type="email"
                      value={ordererEmail}
                      onChange={(e) => setOrdererEmail(e.target.value)}
                      placeholder="Không bắt buộc"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick_return_branch">Kho thu hồi</Label>
                    <select
                      id="quick_return_branch"
                      value={returnBranchId}
                      onChange={(e) => setReturnBranchId(e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">= Kho giao{branchId ? ` (${branchName(branchId)})` : ""}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nhận hàng</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant={!selfPickup ? "default" : "outline"}
                        className={cn("h-9", selfPickup && "bg-background")}
                        onClick={() => setSelfPickup(false)}
                      >
                        Giao tới địa chỉ
                      </Button>
                      <Button
                        type="button"
                        variant={selfPickup ? "default" : "outline"}
                        className={cn("h-9", !selfPickup && "bg-background")}
                        onClick={() => setSelfPickup(true)}
                      >
                        Khách tự lấy tại kho
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t border-violet-200 pt-3 dark:border-violet-900/70">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={otherReceiver} onChange={(e) => setOtherReceiver(e.target.checked)} />
                    <span className="font-medium">Người nhận khác</span>
                    <span className="text-xs text-muted-foreground">(bỏ trống = người đặt nhận hàng)</span>
                  </label>
                  {otherReceiver && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="quick_receiver_name">
                          Tên người nhận
                          <Req />
                        </Label>
                        <OrdererSuggestInput
                          id="quick_receiver_name"
                          value={receiverName}
                          onChange={(e) => setReceiverName(e.target.value)}
                          className="bg-background"
                          onPick={(o) => {
                            setReceiverName(o.name);
                            setReceiverPhone(o.phone ?? "");
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quick_receiver_phone">
                          SĐT người nhận
                          <Req />
                        </Label>
                        <OrdererSuggestInput
                          id="quick_receiver_phone"
                          inputMode="tel"
                          value={receiverPhone}
                          onChange={(e) => setReceiverPhone(e.target.value)}
                          className="bg-background"
                          onPick={(o) => {
                            setReceiverName(o.name);
                            setReceiverPhone(o.phone ?? "");
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quick_receiver_address">Địa chỉ nhận</Label>
                        <Input
                          id="quick_receiver_address"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          disabled={selfPickup}
                          placeholder={selfPickup ? "Khách tự lấy tại kho" : "Số nhà, đường, phường"}
                          className="bg-background"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm sm:col-span-3">
                        <input type="checkbox" checked={returnDiffers} onChange={(e) => setReturnDiffers(e.target.checked)} />
                        <span className="font-medium">Trả hàng ở địa chỉ khác</span>
                        <span className="text-xs text-muted-foreground">(mở thêm Tên · SĐT · Địa chỉ trả)</span>
                      </label>
                      {returnDiffers && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="quick_return_name">Tên người trả</Label>
                            <OrdererSuggestInput
                              id="quick_return_name"
                              value={returnName}
                              onChange={(e) => setReturnName(e.target.value)}
                              placeholder={receiverName || "Trống = người nhận"}
                              className="bg-background"
                              onPick={(o) => {
                                setReturnName(o.name);
                                setReturnPhone(o.phone ?? "");
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="quick_return_phone">SĐT người trả</Label>
                            <OrdererSuggestInput
                              id="quick_return_phone"
                              inputMode="tel"
                              value={returnPhone}
                              onChange={(e) => setReturnPhone(e.target.value)}
                              placeholder={receiverPhone || "Trống = SĐT người nhận"}
                              className="bg-background"
                              onPick={(o) => {
                                setReturnName(o.name);
                                setReturnPhone(o.phone ?? "");
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="quick_return_address">Địa chỉ trả</Label>
                            <Input
                              id="quick_return_address"
                              value={returnAddress}
                              onChange={(e) => setReturnAddress(e.target.value)}
                              placeholder={deliveryAddress || "Trống = như địa chỉ nhận"}
                              className="bg-background"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="sticky -bottom-4 z-10 -mx-4 border-t bg-popover">
            {/* Thanh tóm tắt (§C4). */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b bg-muted/40 px-4 py-2 text-sm">
              <span>
                <span className="text-muted-foreground">Số món</span> <b className="tabular-nums">{itemCount}</b>
              </span>
              <span>
                <span className="text-muted-foreground">Số ngày</span> <b className="tabular-nums">{dayCount}</b>
              </span>
              <span>
                <span className="text-muted-foreground">Tạm tính</span> <b className="tabular-nums">{vnd(total)}</b>
                {commitMonths && (
                  <span className="ml-1 text-xs text-muted-foreground">≈ {vnd(Math.round(total / commitMonths))}/tháng</span>
                )}
              </span>
              <span>
                <span className="text-muted-foreground">Cọc</span>{" "}
                <b className="tabular-nums">{cart.length === 0 ? "—" : deposit > 0 ? vnd(deposit) : "Không cần cọc"}</b>
              </span>
              <span
                className={cn(
                  "ml-auto text-xs font-medium",
                  missing.length ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {missing.length ? `Còn thiếu: ${missing.join(", ")}` : "✓ Đủ thông tin để tạo đơn"}
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-2 px-4 py-3">
              <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <div className="ml-auto flex flex-wrap items-start gap-2">
                <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                  Người phụ trách
                  <select
                    id="quick_employee"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground"
                  >
                    {sortedEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id === catalog?.currentEmployeeId ? `${e.name} (tôi)` : e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col items-center gap-0.5">
                  <Button type="button" variant="outline" className="h-10" disabled={saving || !catalog} onClick={() => submit("quote")}>
                    <FileText className="size-4" />
                    Tạo báo giá
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Gửi báo giá cho khách, chưa chốt</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Button type="button" className="h-10 px-5 text-base" disabled={saving || !catalog} onClick={() => submit("deal")}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {saving ? "Đang tạo…" : "Tạo & chốt đơn"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Khách đã đồng ý, chuyển sang chuẩn bị</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
