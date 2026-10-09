"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { tieredPrice, type PricingTierInput } from "@/lib/rental-pricing";
import {
  applySharedPricingTemplate,
  saveEquipmentCustomTiers,
  type CustomTierInput,
} from "@/lib/actions/equipment";

// Tab "Bảng giá" của mã hàng (B3, Grok CRM 09/10). Nguồn thang: Bảng giá mẫu
// dùng chung hoặc Thang giá riêng của mã. Bậc = MỐC (từ N ngày/tháng giảm X%),
// giữa 2 mốc giá nội suy, từ 1 tháng = giá tháng/30 cho ngày lẻ — đúng công
// thức CRM đang chạy (tieredPrice, CEO chốt 06/10), không đổi.

type Unit = "day" | "month";
type Row = { min: string; unit: Unit; pct: string };
type SharedTemplate = { id: string; name: string; tiers: PricingTierInput[] };

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const WEB_MARKS = [1, 3, 7, 14, 30] as const;
const thresholdDays = (r: { min: number; unit: Unit }) => (r.unit === "month" ? r.min * 30 : r.min);

function toRows(tiers: PricingTierInput[]): Row[] {
  return tiers
    .filter((t) => t.duration_unit === "day" || t.duration_unit === "month")
    .map((t) => ({ min: String(t.min_duration), unit: t.duration_unit as Unit, pct: String(t.discount_percentage) }))
    .sort((a, b) => thresholdDays({ min: +a.min, unit: a.unit }) - thresholdDays({ min: +b.min, unit: b.unit }));
}

export function PriceTierEditor({
  typeId,
  basePrice,
  canEdit,
  sharedTemplates,
  currentTemplateId,
  customTiers,
  variants,
}: {
  typeId: string;
  // Giá 1 ngày của mã (biến thể giá riêng áp cùng % trên giá của nó).
  basePrice: number;
  canEdit: boolean;
  sharedTemplates: SharedTemplate[];
  currentTemplateId: string | null;
  // Thang riêng đang dùng (null = đang theo bảng giá mẫu).
  customTiers: PricingTierInput[] | null;
  variants: { label: string; price: number }[];
}) {
  const hasCustom = customTiers !== null;
  const currentShared = sharedTemplates.find((t) => t.id === currentTemplateId) ?? null;
  // Mẫu để so sánh / quay về: mẫu đang gán, không thì mẫu đầu tiên.
  const compareTemplate = currentShared ?? sharedTemplates[0] ?? null;
  const [mode, setMode] = useState<"shared" | "custom">(hasCustom ? "custom" : "shared");
  const [sharedId, setSharedId] = useState(currentShared?.id ?? sharedTemplates[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(customTiers ?? compareTemplate?.tiers ?? []));
  const [tryDays, setTryDays] = useState("10");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [pending, startTransition] = useTransition();

  const parsed = rows.map((r) => ({ min: Number(r.min), unit: r.unit, pct: Number(r.pct) }));
  // Lỗi theo dòng (chặn lưu) + cảnh báo giá/ngày tăng (chỉ nhắc, vẫn lưu được).
  const rowErrors = parsed.map((r, i) => {
    if (!Number.isInteger(r.min) || r.min < 1) return "Mốc phải là số nguyên ≥ 1.";
    if (!(r.pct > 0 && r.pct < 100)) return "% giảm phải trong khoảng 0–100.";
    const dup = parsed.findIndex((o, j) => j < i && o.unit === r.unit && o.min === r.min);
    if (dup >= 0) return `Trùng mốc với bậc ${dup + 1}.`;
    return null;
  });
  const order = parsed
    .map((r, i) => ({ ...r, i }))
    .filter((r) => !rowErrors[r.i])
    .sort((a, b) => thresholdDays(a) - thresholdDays(b));
  const perDay = (r: { pct: number }) => basePrice * (1 - r.pct / 100);
  const rowWarnings: (string | null)[] = rows.map(() => null);
  for (let k = 1; k < order.length; k++) {
    if (perDay(order[k]) > perDay(order[k - 1]) + 0.5) {
      rowWarnings[order[k].i] = "Giá/ngày cao hơn bậc ngắn hơn — kiểm tra lại (vẫn lưu được).";
    }
  }
  const valid = rows.length > 0 && rowErrors.every((e) => !e);

  const activeTiers: PricingTierInput[] =
    mode === "custom"
      ? order.map((r) => ({ min_duration: r.min, duration_unit: r.unit, discount_percentage: r.pct }))
      : (sharedTemplates.find((t) => t.id === sharedId)?.tiers ?? []);
  const compareByKey = new Map(
    (compareTemplate?.tiers ?? []).map((t) => [`${t.duration_unit}:${t.min_duration}`, t.discount_percentage]),
  );

  const n = Math.max(1, Math.round(Number(tryDays) || 1));
  const tryTotal = tieredPrice(basePrice, "day", n, activeTiers);
  const tryShared = compareTemplate ? tieredPrice(basePrice, "day", n, compareTemplate.tiers) : null;

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function setRowPrice(i: number, value: string) {
    // Nhập giá/ngày (hoặc giá/tháng) → quy ra % giảm trên giá ngày hiện tại.
    const v = Number(value);
    const r = rows[i];
    const full = r.unit === "month" ? basePrice * 30 : basePrice;
    if (!(v > 0) || !(full > 0)) return;
    setRow(i, { pct: String(Math.round((1 - v / full) * 10000) / 100) });
  }

  function save() {
    if (!valid) return toast.error("Còn bậc sai — sửa dòng báo đỏ trước khi lưu.");
    const tiers: CustomTierInput[] = order.map((r) => ({
      min_duration: r.min,
      duration_unit: r.unit,
      discount_percentage: r.pct,
    }));
    startTransition(async () => {
      const res = await saveEquipmentCustomTiers(typeId, tiers);
      if ("error" in res) return void toast.error(res.error);
      setSavedAt(res.savedAt);
      toast.success("Đã lưu thang giá riêng — đơn đã tạo giữ nguyên giá.");
    });
  }
  function applyShared(templateId: string) {
    startTransition(async () => {
      const res = await applySharedPricingTemplate(typeId, templateId);
      if ("error" in res) return void toast.error(res.error);
      setSavedAt(res.savedAt);
      setMode("shared");
      setConfirmRevert(false);
      toast.success("Đã chuyển về Bảng giá mẫu.");
    });
  }

  const usingCustomNow = mode === "custom";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Thang giá thuê nhiều ngày</CardTitle>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nguồn thang giá">
            <Button
              type="button"
              size="sm"
              variant={!usingCustomNow ? "default" : "outline"}
              disabled={!canEdit && usingCustomNow}
              onClick={() => (hasCustom ? setConfirmRevert(true) : setMode("shared"))}
            >
              Theo Bảng giá mẫu
            </Button>
            <Button
              type="button"
              size="sm"
              variant={usingCustomNow ? "default" : "outline"}
              disabled={!canEdit && !usingCustomNow}
              onClick={() => {
                if (!hasCustom) setRows(toRows(sharedTemplates.find((t) => t.id === sharedId)?.tiers ?? compareTemplate?.tiers ?? []));
                setMode("custom");
              }}
            >
              Thang giá riêng
            </Button>
          </div>
          {confirmRevert && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="min-w-0 flex-1">
                Dùng lại Bảng giá mẫu sẽ <b>xoá thang giá riêng</b> của mã này. Đơn đã tạo giữ nguyên giá.
              </span>
              <select
                value={sharedId}
                onChange={(e) => setSharedId(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {sharedTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevert(false)}>
                Đóng
              </Button>
              <Button type="button" size="sm" disabled={pending || !sharedId} onClick={() => applyShared(sharedId)}>
                Dùng lại Bảng giá mẫu
              </Button>
            </div>
          )}
          {!usingCustomNow && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Bảng giá mẫu:</span>
              {canEdit ? (
                <select
                  value={sharedId}
                  onChange={(e) => setSharedId(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {sharedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <b>{currentShared?.name ?? "—"}</b>
              )}
              {canEdit && sharedId && sharedId !== currentTemplateId && (
                <Button type="button" size="sm" disabled={pending} onClick={() => applyShared(sharedId)}>
                  Áp bảng giá này
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Từ mốc</th>
                  <th className="py-2 pr-2 font-medium">Giảm</th>
                  <th className="py-2 pr-2 text-right font-medium">Giá/ngày (tự tính)</th>
                  <th className="py-2 pr-2 text-right font-medium">Trọn gói mốc</th>
                  <th className="py-2 pr-2 text-right font-medium">Mẫu chung</th>
                  {usingCustomNow && canEdit && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {(usingCustomNow
                  ? rows.map((r, i) => ({ r, i }))
                  : toRows(activeTiers).map((r, i) => ({ r, i }))
                ).map(({ r, i }) => {
                  const min = Number(r.min);
                  const pct = Number(r.pct);
                  const day = basePrice * (1 - pct / 100);
                  const pkg = day * thresholdDays({ min, unit: r.unit });
                  const cmp = compareByKey.get(`${r.unit}:${min}`);
                  const editable = usingCustomNow && canEdit;
                  const err = usingCustomNow ? rowErrors[i] : null;
                  const warn = usingCustomNow ? rowWarnings[i] : null;
                  return (
                    <tr key={i} className={cn("border-b align-top last:border-0", err && "bg-destructive/5")}>
                      <td className="py-2 pr-2">
                        {editable ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              value={r.min}
                              onChange={(e) => setRow(i, { min: e.target.value })}
                              className="h-8 w-16"
                              aria-label={`Mốc bậc ${i + 1}`}
                            />
                            <select
                              value={r.unit}
                              onChange={(e) => setRow(i, { unit: e.target.value as Unit })}
                              className="h-8 rounded-md border bg-background px-1.5 text-sm"
                              aria-label={`Đơn vị bậc ${i + 1}`}
                            >
                              <option value="day">ngày</option>
                              <option value="month">tháng</option>
                            </select>
                          </div>
                        ) : (
                          <span>
                            {min} {r.unit === "month" ? "tháng" : "ngày"}
                          </span>
                        )}
                        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                        {warn && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-3" /> {warn}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {editable ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0.01}
                              max={99.99}
                              step="any"
                              value={r.pct}
                              onChange={(e) => setRow(i, { pct: e.target.value })}
                              className="h-8 w-20"
                              aria-label={`% giảm bậc ${i + 1}`}
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        ) : (
                          <span>−{pct}%</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {editable ? (
                          <Input
                            type="number"
                            min={0}
                            step={1000}
                            key={`${r.pct}-${r.unit}`}
                            defaultValue={Math.round(r.unit === "month" ? day * 30 : day)}
                            onBlur={(e) => setRowPrice(i, e.target.value)}
                            className="ml-auto h-8 w-32 text-right"
                            aria-label={r.unit === "month" ? `Giá/tháng bậc ${i + 1}` : `Giá/ngày bậc ${i + 1}`}
                          />
                        ) : (
                          vnd(day)
                        )}
                        {r.unit === "month" && <p className="text-xs text-muted-foreground">{editable ? "giá/tháng" : `${vnd(day * 30)}/tháng`}</p>}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{vnd(pkg)}</td>
                      <td className="py-2 pr-2 text-right text-xs text-muted-foreground tabular-nums">
                        {cmp != null ? `−${cmp}% · ${vnd(basePrice * (1 - cmp / 100))}` : "—"}
                      </td>
                      {editable && (
                        <td className="py-2">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">Xoá bậc</span>
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Bậc là <b>mốc</b>: thuê đúng mốc trả trọn gói mốc; số ngày nằm giữa 2 mốc thì giá nội suy giữa 2 gói; từ 1
            tháng, ngày lẻ tính theo giá tháng/30 của bậc tháng. Cam kết 3/6/12 tháng là bậc riêng. Biến thể có giá riêng
            áp cùng % trên giá của biến thể.
          </p>
          {usingCustomNow && canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const last = order.at(-1);
                  setRows((rs) => [
                    ...rs,
                    { min: String(last && last.unit === "day" ? last.min + 1 : 1), unit: last?.unit ?? "day", pct: last ? String(last.pct) : "10" },
                  ]);
                }}
              >
                <Plus className="size-3.5" /> Thêm bậc
              </Button>
              <Button type="button" size="sm" disabled={pending || !valid} onClick={save}>
                {pending ? "Đang lưu…" : hasCustom ? "Lưu thang giá riêng" : "Tạo thang giá riêng"}
              </Button>
              {!valid && <span className="text-xs text-destructive">Còn bậc sai — xem dòng báo đỏ.</span>}
            </div>
          )}
          {savedAt && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Đã lưu và gửi cập nhật lên web lúc{" "}
              {new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — web hiện giá mới
              sau tối đa vài phút.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Thử giá + xem trước bảng giá trên web. */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Thử giá</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            Thuê
            <Input
              type="number"
              min={1}
              value={tryDays}
              onChange={(e) => setTryDays(e.target.value)}
              className="h-8 w-20"
            />
            ngày
          </label>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-lg font-semibold tabular-nums">{vnd(tryTotal)}</p>
            <p className="text-xs text-muted-foreground">
              ≈ {vnd(tryTotal / n)}/ngày · 1 cái, giá gốc {vnd(basePrice)}/ngày
            </p>
            {usingCustomNow && tryShared !== null && Math.round(tryShared) !== Math.round(tryTotal) && (
              <p className="mt-1 text-xs text-muted-foreground">Theo mẫu chung: {vnd(tryShared)}</p>
            )}
          </div>
          {variants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Biến thể · {n} ngày</p>
              {variants.map((v) => (
                <p key={v.label} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{v.label}</span>
                  <span className="tabular-nums">{vnd(tieredPrice(v.price, "day", n, activeTiers))}</span>
                </p>
              ))}
            </div>
          )}
          {/* Giống hệt bảng "Thuê càng lâu càng rẻ" trên web (price-calculator: mốc
              1/3/7/14/30 ngày, giá/ngày = tổng mốc / số ngày). */}
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Web hiện (giá/ngày)</p>
            {WEB_MARKS.map((d) => (
              <p key={d} className="flex justify-between text-xs">
                <span>{d === 30 ? "1 tháng" : `${d} ngày`}</span>
                <span className="tabular-nums">{vnd(Math.round(tieredPrice(basePrice, "day", d, activeTiers) / d))}</span>
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
