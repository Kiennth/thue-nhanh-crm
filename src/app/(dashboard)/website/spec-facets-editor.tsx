"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Filter, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSpec, minSpecsFor, SPEC_FIELDS, specGroupKey, SPEC_GROUPS, specValues, type SpecFacets } from "@/lib/spec-fields";
import { cn } from "@/lib/utils";

// "Thông số lọc (web)" trong khung sửa sản phẩm web (đề xuất CRM v2 §1a):
// ô nhập theo NHÓM HÀNG của danh mục đang chọn — ô số có đơn vị cố định
// (nhập 55 → web hiện "55 inch"), lựa chọn có sẵn, chữ tự do cho hãng/chip.
// Web lấy bộ lọc + 3 thông số trên thẻ từ đây. Trường không thuộc nhóm hiện
// tại vẫn được giữ nguyên (đổi danh mục qua lại không mất dữ liệu).
// B4 (Grok CRM 09/10): dùng chung cho khung sửa Website VÀ tab "Thông số &
// web" ở trang mã hàng — cùng 1 cột website_products.spec_facets. ★ = hiện
// trên thẻ, phễu = bộ lọc web; dưới 4 thông số → web không đủ khối "Thông số
// nổi bật"; trường không thuộc nhóm hiện tại (đổi danh mục) → "Thông số cũ".
export function SpecFacetsEditor({
  categorySlug,
  productSlug,
  initial,
  onChange,
}: {
  categorySlug: string | null;
  productSlug?: string | null;
  initial: SpecFacets;
  onChange?: (facets: SpecFacets) => void;
}) {
  const [facets, setFacets] = useState<SpecFacets>(initial ?? {});
  // Báo ra ngoài (tab Thông số ở trang mã hàng tự lưu bằng nút riêng).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChangeRef.current?.(facets);
  }, [facets]);
  // Ô số đang gõ dở (vd "13," hoặc "128, 256") giữ dạng chữ tới khi rời ô.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const groupKey = specGroupKey(categorySlug, productSlug);
  const group = SPEC_GROUPS[groupKey];
  const filled = group.fields.filter((c) => specValues(facets[c]).length > 0).length;
  const legacy = Object.keys(facets).filter((c) => !group.fields.includes(c) && SPEC_FIELDS[c]);

  const set = (code: string, v: SpecFacets[string] | undefined) =>
    setFacets((prev) => {
      const next = { ...prev };
      if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") delete next[code];
      else next[code] = v;
      return next;
    });

  const marks = (code: string) => (
    <>
      {group.card.includes(code) && <Star className="ml-1 inline size-3 fill-amber-400 text-amber-400" aria-label="hiện trên thẻ" />}
      {group.filters.includes(code) && <Filter className="ml-1 inline size-3" aria-label="bộ lọc web" />}
    </>
  );

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="spec_facets_json" value={JSON.stringify(facets)} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Thông số (web)</Label>
        <span className="text-xs text-muted-foreground">
          Nhóm: {group.label} · <Star className="inline size-3 fill-amber-400 text-amber-400" /> hiện trên thẻ ·{" "}
          <Filter className="inline size-3" /> bộ lọc web · đã điền {filled}/{group.fields.length}
        </span>
      </div>
      {filled < minSpecsFor(group) && (
        <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-3.5 shrink-0" />
          Mới có {filled} thông số — nên điền ít nhất {minSpecsFor(group)} để trang sản phẩm có khối &quot;Thông số nổi
          bật&quot; đầy đủ.
          Không lấy từ tên sản phẩm.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.fields.map((code) => {
          const f = SPEC_FIELDS[code];
          const id = `spec_${code}`;
          const value = facets[code];
          if (f.kind === "num") {
            const shown = drafts[code] ?? specValues(value).map((n) => String(n).replace(".", ",")).join(", ");
            return (
              <div key={code} className="space-y-1">
                <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
                  {f.label.vi} ({f.unit})
                  {marks(code)}
                </Label>
                <div className="relative">
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={shown}
                    placeholder={code === "bo_nho_gb" ? "128, 256" : undefined}
                    onChange={(e) => setDrafts((d) => ({ ...d, [code]: e.target.value }))}
                    onBlur={(e) => {
                      // "128, 256" / "128/256" → [128, 256]; "13,6" · "1,24" (dấu phẩy
                      // liền số, không cách) → số thập phân 13.6 · 1.24.
                      const raw = e.target.value.trim();
                      const parts = /^\d+,\d+$/.test(raw)
                        ? [raw.replace(",", ".")]
                        : raw.split(/\s*[;/]\s*|,\s+|\s+/).filter(Boolean);
                      // "4.000" (chấm ngăn nghìn kiểu Việt) → 4000, không phải 4.
                      const nums = parts
                        .map((p) => Number(/^\d{1,3}(\.\d{3})+$/.test(p) ? p.replace(/\./g, "") : p.replace(",", ".")))
                        .filter((n) => Number.isFinite(n));
                      set(code, nums.length > 1 ? nums : nums[0]);
                      setDrafts((d) => {
                        const next = { ...d };
                        delete next[code];
                        return next;
                      });
                    }}
                    className="pr-14"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    {f.unit}
                  </span>
                </div>
              </div>
            );
          }
          if (f.kind === "enum") {
            const selected = specValues(value).map(String);
            return (
              <div key={code} className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {f.label.vi}
                  {marks(code)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(f.options).map(([k, o]) => {
                    const on = selected.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (f.multi) set(code, on ? selected.filter((x) => x !== k) : [...selected, k]);
                          else set(code, on ? undefined : k);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                        )}
                      >
                        {o.vi}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div key={code} className="space-y-1">
              <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
                {f.label.vi}
                {marks(code)}
              </Label>
              <Input
                id={id}
                value={typeof value === "string" ? value : specValues(value).join(", ")}
                placeholder={f.placeholder}
                maxLength={80}
                onChange={(e) => set(code, e.target.value)}
              />
            </div>
          );
        })}
      </div>
      {legacy.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Thông số cũ (cần xem) — không thuộc nhóm {group.label}, web không hiện. Xoá nếu không còn đúng.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {legacy.map((code) => (
              <span key={code} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
                {SPEC_FIELDS[code].label.vi}: {formatSpec(code, facets[code])}
                <button type="button" onClick={() => set(code, undefined)} aria-label={`Xoá ${SPEC_FIELDS[code].label.vi}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
