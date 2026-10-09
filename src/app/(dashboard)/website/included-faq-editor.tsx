"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Info, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FAQ_A_MAX,
  FAQ_MAX,
  FAQ_Q_MAX,
  INCLUDED_LINE_MAX,
  INCLUDED_MAX,
  INCLUDED_MIN,
  firstLineHasName,
  includedSuggestion,
  repeatsPolicy,
  type Faq,
} from "@/lib/product-extras";

// B9 (Grok CRM 09/10): khối "Đã gồm gì" + "FAQ riêng" của trang sản phẩm web.
// Đi theo form khung sửa qua hidden input (included_items_json, faqs_json) —
// chỉ lưu khi bấm Lưu. Để trống = web tự dùng mặc định (dòng hộp máy trong mô
// tả / FAQ của danh mục / FAQ chung).

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function IncludedItemsEditor({
  initial,
  productName,
  accessories,
}: {
  initial: string[];
  productName: string;
  // Phụ kiện đi kèm của mã ("Sạc | Cable | Ốp lưng") — nguồn gợi ý.
  accessories: string | null;
}) {
  const [lines, setLines] = useState<string[]>(initial);
  const filled = lines.map((l) => l.trim()).filter(Boolean);
  const nameWarn = filled.length > 0 && !firstLineHasName(filled[0], productName);
  const suggestion = includedSuggestion(productName, accessories);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="included_items_json" value={JSON.stringify(filled)} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Đã gồm gì</Label>
        <span className="text-xs text-muted-foreground">
          {filled.length}/{INCLUDED_MAX} dòng · nên {INCLUDED_MIN}–{INCLUDED_MAX} dòng, mỗi dòng ≤ {INCLUDED_LINE_MAX} ký tự ·
          dòng &quot;Kiểm tra máy cùng nhân viên…&quot; web tự thêm
        </span>
      </div>
      {lines.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-violet-400 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
          <Sparkles className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">Gợi ý: {suggestion.join(" · ")}</span>
          <button type="button" className="font-semibold hover:underline" onClick={() => setLines(suggestion)}>
            Dùng
          </button>
          <span className="basis-full text-muted-foreground">Để trống thì web lấy dòng hộp máy trong mô tả.</span>
        </div>
      )}
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <Input
              value={line}
              maxLength={INCLUDED_LINE_MAX}
              onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
              placeholder={i === 0 ? `1 × ${productName}` : "vd: Sạc 35W + cáp USB-C"}
              className={cn("h-8 text-sm", i === 0 && nameWarn && "border-amber-400")}
              aria-label={`Đã gồm gì dòng ${i + 1}`}
            />
            <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => setLines((ls) => move(ls, i, -1))}>
              <ArrowUp className="size-3.5" />
              <span className="sr-only">Lên</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={i === lines.length - 1}
              onClick={() => setLines((ls) => move(ls, i, 1))}
            >
              <ArrowDown className="size-3.5" />
              <span className="sr-only">Xuống</span>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5 text-destructive" />
              <span className="sr-only">Xoá dòng</span>
            </Button>
          </div>
        ))}
      </div>
      {nameWarn && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Dòng đầu nên có tên sản phẩm (vd &quot;1 × {productName}&quot;) — vẫn lưu được.
        </p>
      )}
      {filled.length === 1 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Nên có ít nhất {INCLUDED_MIN} dòng (máy + phụ kiện).</p>
      )}
      {lines.length < INCLUDED_MAX ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, ""])}>
          <Plus className="size-3.5" /> Thêm dòng
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Đã đủ {INCLUDED_MAX} dòng.</p>
      )}
    </div>
  );
}

export function FaqListEditor({
  initial,
  title,
  emptyHint,
}: {
  initial: Faq[];
  title: string;
  emptyHint: string;
}) {
  const [faqs, setFaqs] = useState<Faq[]>(initial);
  const filled = faqs.filter((f) => f.q.trim() || f.a.trim());
  const set = (i: number, patch: Partial<Faq>) => setFaqs((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="faqs_json" value={JSON.stringify(filled)} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>{title}</Label>
        <span className={cn("text-xs", filled.length >= FAQ_MAX ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {filled.length}/{FAQ_MAX}
        </span>
      </div>
      {faqs.length === 0 && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
      {faqs.map((f, i) => {
        const incomplete = (f.q.trim() && !f.a.trim()) || (!f.q.trim() && f.a.trim());
        return (
          <div key={i} className="space-y-1.5 rounded-md bg-muted/40 p-2">
            <div className="flex items-center gap-1">
              <Input
                value={f.q}
                maxLength={FAQ_Q_MAX}
                onChange={(e) => set(i, { q: e.target.value })}
                placeholder="Câu hỏi (≤ 120 ký tự)"
                className="h-8 bg-background text-sm font-medium"
                aria-label={`Câu hỏi ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => setFaqs((fs) => move(fs, i, -1))}>
                <ArrowUp className="size-3.5" />
                <span className="sr-only">Lên</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === faqs.length - 1}
                onClick={() => setFaqs((fs) => move(fs, i, 1))}
              >
                <ArrowDown className="size-3.5" />
                <span className="sr-only">Xuống</span>
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFaqs((fs) => fs.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5 text-destructive" />
                <span className="sr-only">Xoá câu</span>
              </Button>
            </div>
            <Textarea
              value={f.a}
              maxLength={FAQ_A_MAX}
              onChange={(e) => set(i, { a: e.target.value })}
              placeholder="Câu trả lời (≤ 400 ký tự)"
              rows={2}
              className="bg-background text-sm"
              aria-label={`Câu trả lời ${i + 1}`}
            />
            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              <span>{f.a.length}/{FAQ_A_MAX}</span>
              {incomplete && <span className="text-amber-700 dark:text-amber-300">Cần cả câu hỏi và câu trả lời.</span>}
              {repeatsPolicy(f) && (
                <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
                  <Info className="size-3" /> Cọc / CCCD / huỷ / VAT đã có ở dải chính sách chung — chỉ giữ nếu khác riêng cho máy này.
                </span>
              )}
            </div>
          </div>
        );
      })}
      {faqs.length < FAQ_MAX ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setFaqs((fs) => [...fs, { q: "", a: "" }])}>
          <Plus className="size-3.5" /> Thêm câu hỏi
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Đã đủ {FAQ_MAX} câu.</p>
      )}
    </div>
  );
}
