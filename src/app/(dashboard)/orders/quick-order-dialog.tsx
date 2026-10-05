"use client";

import { useMemo, useRef, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Search, Truck, X } from "lucide-react";
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
function randomOrderCode() {
  const now = new Date();
  return `DH${datePart(now).replaceAll("-", "")}-${Math.floor(Math.random() * 900) + 100}`;
}

type CartLine = { item: QuickOrderCatalogItem; quantity: number };

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
}
const BIKE_DELIVERY_ID = "38f5c644-3898-4b1f-a3f5-901e55f77c6a";
const BIKE_COLLECTION_ID = "13c85fe0-8b13-4d76-9df5-a20b19598cc9";
const CAR_DELIVERY_ID = "ce4a5f88-8daa-47c2-92fc-196d1fc321db";
const CAR_COLLECTION_ID = "1a53924a-a070-44b0-9441-3f09042af7e7";
// Mặc định xe máy chở tối đa 5 cái/món (giống web — SHIP_RATES.defaultBikeMaxQty).
const DEFAULT_BIKE_MAX_QTY = 5;

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
  const [startMinute] = useState(() => minutePart(start));
  const [endDate, setEndDate] = useState(() => datePart(prefillEnd ?? new Date(start.getTime() + 86_400_000)));
  const [endHour, setEndHour] = useState(() => hourPart(prefillEnd ?? start));
  const [endMinute] = useState(() => (prefillEnd ? minutePart(prefillEnd) : "00"));
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
  const [orderCode, setOrderCode] = useState(randomOrderCode);
  const [returnBranchId, setReturnBranchId] = useState("");
  const [ordererName, setOrdererName] = useState(prefill?.ordererName ?? "");
  const [ordererPhone, setOrdererPhone] = useState(prefill?.ordererPhone ?? "");
  const [ordererEmail, setOrdererEmail] = useState(prefill?.ordererEmail ?? "");
  const [orderDate, setOrderDate] = useState(() => datePart(new Date()));

  function handleOpenChange(next: boolean) {
    setOpen(next);
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
      return [...c, { item, quantity: 1 }];
    });
    setQuery("");
    setShowResults(false);
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
        order_code: orderCode,
        order_date: orderDate,
        orderer_name: ordererName || null,
        orderer_phone: ordererPhone || null,
        orderer_email: ordererEmail || null,
        employee_id: employeeId,
        stage,
        web_order_id: prefill?.webOrderId ?? null,
        items: allLines.map((l) => ({ typeId: l.item.typeId, unitId: l.item.unitId, quantity: l.quantity })),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      for (const w of result.warnings) toast.warning(w, { duration: 10_000 });
      toast.success(stage === "deal" ? "Đã tạo và chốt đơn" : "Đã tạo đơn");
      setOpen(false);
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
          {/* Khách + kho */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Khách hàng</Label>
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
              <Label>Kho giao</Label>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => (
                  <Button
                    key={b.id}
                    type="button"
                    size="sm"
                    variant={branchId === b.id ? "default" : "outline"}
                    onClick={() => setBranchId(b.id)}
                  >
                    {b.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Thời gian */}
          <div className="space-y-2">
            <Label htmlFor="quick_start_date">Thời gian thuê</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">Nhận</span>
                <DateInput
                  id="quick_start_date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
                <HourSelect value={startHour} onChange={setStartHour} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">Trả</span>
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

          {/* Hàng */}
          <div className="space-y-2">
            <Label>Hàng thuê</Label>
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
                    placeholder="Gõ tên hàng (vd: ipad gen 9, loa jbl) rồi chọn — Enter chọn dòng đầu"
                    className="pl-8"
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
                  <div className="divide-y rounded-md border">
                    {allLines.map((line, i) => {
                      const isTransport = line.item.typeId in TRANSPORT_LABELS;
                      const free = freeAt(line.item);
                      const short = free !== null && line.quantity > free;
                      return (
                        <div key={line.item.key} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{line.item.label}</p>
                            {short && (
                              <p className="text-xs text-destructive">
                                Kho đang có {free} máy trống — máy về kịp trước ngày thuê sẽ được tính; còn thiếu thì
                                hệ thống thêm máy tạm &quot;CHỜ MUA&quot; để vẫn lên được đơn.
                              </p>
                            )}
                          </div>
                          <div className={cn("flex items-center gap-1", isTransport && "invisible")}>
                            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setQty(line.item.key, line.quantity - 1)}>
                              <Minus className="size-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) => setQty(line.item.key, Math.max(1, Number(e.target.value) || 1))}
                              className="h-8 w-14 text-center"
                            />
                            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setQty(line.item.key, line.quantity + 1)}>
                              <Plus className="size-3.5" />
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
                    <div className="flex justify-between px-2.5 py-2 text-sm font-semibold">
                      <span>Tạm tính (chưa VAT, chưa giảm giá)</span>
                      <span className="tabular-nums">{vnd(total)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chi tiết luôn mở sẵn (CEO 2026-10-05: không ẩn mã đơn, người đặt). */}
          <div className="rounded-md border px-3 py-3">
            <p className="text-sm font-medium text-muted-foreground">Chi tiết đơn</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick_order_code">Mã đơn</Label>
                <Input id="quick_order_code" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} />
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
              <div className="space-y-1.5">
                <Label htmlFor="quick_order_date">Ngày đơn</Label>
                <DateInput id="quick_order_date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
            </div>
          </div>

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
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" disabled={saving || !catalog} onClick={() => submit("quote")}>
                Tạo đơn (đã báo giá)
              </Button>
              <Button type="button" disabled={saving || !catalog} onClick={() => submit("deal")}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Tạo &amp; chốt đơn
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
