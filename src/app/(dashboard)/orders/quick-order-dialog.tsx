"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, Minus, Plus, Search, Truck, X } from "lucide-react";
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
  RENTAL_PRESET_OPTIONS,
  computeOrderLinePrice,
  computeRentalDurationInUnit,
  defaultRentalStart,
} from "@/lib/rental-pricing";
import { DELIVERY_NOTE_TYPE_IDS } from "@/lib/commission";
import { cn } from "@/lib/utils";
import type { PricingMethod, ProductType, RentalPeriodUnit } from "@/types/database";
import { CustomerCombobox } from "./customer-combobox";

// Popup "Tạo đơn nhanh" (CEO 2026-10-03, phương án A + B + C): mọi thứ cần
// cho 1 đơn thường trên 1 màn hình — khách, kho, gói thời gian, hàng (nhập số
// lượng, máy serial hệ thống tự chọn), phí giao/thu hồi — bấm 1 nút là đơn có
// đủ dòng hàng, giá, và khâu Tiếp nhận/Báo giá (± Chốt đơn) đã hoàn thành.
// Ô ít dùng (mã đơn, kho thu hồi, người đặt...) gập trong "Thêm chi tiết".

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
// Gói hay dùng nhất — "Khác" để chọn ngày giờ kết thúc tay.
const QUICK_PRESET_KEYS = ["1d", "2d", "3d", "7d", "14d", "30d"];
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
function combine(date: string, hour: string) {
  return new Date(`${date}T${hour}:00:00`);
}
function randomOrderCode() {
  const now = new Date();
  return `DH${datePart(now).replaceAll("-", "")}-${Math.floor(Math.random() * 900) + 100}`;
}

type CartLine = { item: QuickOrderCatalogItem; quantity: number };

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

export function QuickOrderDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<QuickOrderCatalog | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string>("");
  const [start] = useState(() => defaultRentalStart(new Date()));
  const [startDate, setStartDate] = useState(() => datePart(start));
  const [startHour, setStartHour] = useState(() => hourPart(start));
  const [presetKey, setPresetKey] = useState<string>("1d");
  const [endDate, setEndDate] = useState(() => datePart(new Date(start.getTime() + 86_400_000)));
  const [endHour, setEndHour] = useState(() => hourPart(start));
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [employeeId, setEmployeeId] = useState("");
  // "Thêm chi tiết"
  const [orderCode, setOrderCode] = useState(randomOrderCode);
  const [returnBranchId, setReturnBranchId] = useState("");
  const [ordererName, setOrdererName] = useState("");
  const [ordererPhone, setOrdererPhone] = useState("");
  const [ordererEmail, setOrdererEmail] = useState("");
  const [orderDate, setOrderDate] = useState(() => datePart(new Date()));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next || catalog) return;
    startLoading(async () => {
      const c = await getQuickOrderCatalog();
      setCatalog(c);
      setEmployeeId((v) => v || c.currentEmployeeId);
      setBranchId((v) => v || c.defaultBranchId || branches[0]?.id || "");
    });
  }

  const startAt = useMemo(() => combine(startDate, startHour), [startDate, startHour]);
  const endAt = useMemo(() => {
    const preset = RENTAL_PRESET_OPTIONS.find((p) => p.key === presetKey);
    return preset ? new Date(startAt.getTime() + preset.hours * 3_600_000) : combine(endDate, endHour);
  }, [presetKey, startAt, endDate, endHour]);
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
  const prices = cart.map(linePrice);
  const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!catalog || !q) return [];
    const words = q.split(/\s+/);
    return catalog.items.filter((i) => words.every((w) => fold(i.label).includes(w))).slice(0, 15);
  }, [catalog, query]);

  const transportItems = useMemo(
    () => (catalog?.items ?? []).filter((i) => DELIVERY_NOTE_TYPE_IDS.has(i.typeId)),
    [catalog],
  );

  function freeAt(item: QuickOrderCatalogItem): number | null {
    return item.freeByBranch ? (item.freeByBranch[branchId] ?? 0) : null;
  }

  function addItem(item: QuickOrderCatalogItem) {
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
    setCart((c) => (c.some((l) => l.item.key === item.key) ? c.filter((l) => l.item.key !== item.key) : [...c, { item, quantity: 1 }]));
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
        items: cart.map((l) => ({ typeId: l.item.typeId, unitId: l.item.unitId, quantity: l.quantity })),
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
          <Button>
            <Plus className="size-4" />
            Tạo đơn nhanh
          </Button>
        }
      />
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo đơn nhanh</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Khách + kho */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Khách hàng</Label>
              <CustomerCombobox name="quick_customer_id" onChange={setCustomerId} />
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Bắt đầu</span>
              <Input
                id="quick_start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
              <HourSelect value={startHour} onChange={setStartHour} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESET_KEYS.map((key) => {
                const preset = RENTAL_PRESET_OPTIONS.find((p) => p.key === key)!;
                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={presetKey === key ? "default" : "outline"}
                    onClick={() => setPresetKey(key)}
                  >
                    {key === "7d" ? "1 tuần" : key === "14d" ? "2 tuần" : preset.label}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={presetKey === "custom" ? "default" : "outline"}
                onClick={() => {
                  setEndDate(datePart(endAt));
                  setEndHour(hourPart(endAt));
                  setPresetKey("custom");
                }}
              >
                Khác…
              </Button>
            </div>
            {presetKey === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Kết thúc</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                <HourSelect value={endHour} onChange={setEndHour} />
              </div>
            )}
            <p className={cn("text-xs", periodValid ? "text-muted-foreground" : "text-destructive")}>
              {periodValid
                ? `Trả: ${endAt.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · tính ${dayCount} ngày`
                : "Thời gian kết thúc phải sau thời gian bắt đầu."}
            </p>
          </div>

          {/* Hàng */}
          <div className="space-y-2">
            <Label>Hàng thuê</Label>
            {loading && !catalog ? (
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
                    {transportItems.map((item) => {
                      const on = cart.some((l) => l.item.key === item.key);
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

                {cart.length > 0 && (
                  <div className="divide-y rounded-md border">
                    {cart.map((line, i) => {
                      const free = freeAt(line.item);
                      const short = free !== null && line.quantity > free;
                      return (
                        <div key={line.item.key} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{line.item.label}</p>
                            {short && (
                              <p className="text-xs text-destructive">
                                Kho này chỉ còn {free} máy trống — sẽ thêm {free}, thiếu {line.quantity - free!}.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
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
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setQty(line.item.key, 0)}>
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

          {/* Ít dùng — gập lại */}
          <details className="group rounded-md border px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground">
              <ChevronDown className="size-4 transition group-open:rotate-180" />
              Thêm chi tiết (mã đơn, kho thu hồi, người đặt hàng, ngày đơn)
            </summary>
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
                <Input id="quick_orderer_name" value={ordererName} onChange={(e) => setOrdererName(e.target.value)} placeholder="Không bắt buộc" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_orderer_phone">SĐT người đặt</Label>
                <Input id="quick_orderer_phone" value={ordererPhone} onChange={(e) => setOrdererPhone(e.target.value)} placeholder="Không bắt buộc" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_orderer_email">Email người đặt</Label>
                <Input id="quick_orderer_email" type="email" value={ordererEmail} onChange={(e) => setOrdererEmail(e.target.value)} placeholder="Không bắt buộc" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_order_date">Ngày đơn</Label>
                <Input id="quick_order_date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
            </div>
          </details>

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
