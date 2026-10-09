"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SPEC_FIELDS, specGroupKey, SPEC_GROUPS, specValues, type SpecFacets } from "@/lib/spec-fields";
import { cn } from "@/lib/utils";

// "Thông số lọc (web)" trong khung sửa sản phẩm web (đề xuất CRM v2 §1a):
// ô nhập theo NHÓM HÀNG của danh mục đang chọn — ô số có đơn vị cố định
// (nhập 55 → web hiện "55 inch"), lựa chọn có sẵn, chữ tự do cho hãng/chip.
// Web lấy bộ lọc + 3 thông số trên thẻ từ đây. Trường không thuộc nhóm hiện
// tại vẫn được giữ nguyên (đổi danh mục qua lại không mất dữ liệu).
export function SpecFacetsEditor({ categorySlug, initial }: { categorySlug: string | null; initial: SpecFacets }) {
  const [facets, setFacets] = useState<SpecFacets>(initial ?? {});
  // Ô số đang gõ dở (vd "13," hoặc "128, 256") giữ dạng chữ tới khi rời ô.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const groupKey = specGroupKey(categorySlug);
  const group = SPEC_GROUPS[groupKey];

  const set = (code: string, v: SpecFacets[string] | undefined) =>
    setFacets((prev) => {
      const next = { ...prev };
      if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") delete next[code];
      else next[code] = v;
      return next;
    });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="spec_facets_json" value={JSON.stringify(facets)} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Thông số lọc (web)</Label>
        <span className="text-xs text-muted-foreground">
          Nhóm: {group.label} — web lọc theo {group.filters.map((c) => SPEC_FIELDS[c].label.vi).join(", ")} · thẻ sản phẩm hiện{" "}
          {group.card.map((c) => SPEC_FIELDS[c].label.vi).join(" · ")}
        </span>
      </div>
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
                </Label>
                <div className="relative">
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={shown}
                    placeholder={code === "bo_nho_gb" ? "128, 256" : undefined}
                    onChange={(e) => setDrafts((d) => ({ ...d, [code]: e.target.value }))}
                    onBlur={(e) => {
                      // "128, 256" → [128, 256]; "13,6" (1 số thập phân) → 13.6
                      const raw = e.target.value.trim();
                      const parts = /^\d+,\d$/.test(raw) ? [raw.replace(",", ".")] : raw.split(/[,;/\s]+/).filter(Boolean);
                      const nums = parts.map((p) => Number(p.replace(",", "."))).filter((n) => Number.isFinite(n));
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
                <span className="text-xs text-muted-foreground">{f.label.vi}</span>
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
    </div>
  );
}
