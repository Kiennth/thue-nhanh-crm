"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uploadWebsiteProductImage } from "@/lib/actions/website";
import { normalizeProductImage } from "@/lib/normalize-image";

// Quản lý gallery ảnh sản phẩm web (CEO 2026-08-17): upload từ máy (nhiều
// file), xoá, mũi tên đổi thứ tự — ảnh ĐẦU TIÊN là ảnh đại diện trên thẻ sản
// phẩm. Danh sách cuối cùng đi theo form qua hidden input gallery_json khi
// bấm Lưu (xoá/đổi thứ tự chưa bấm Lưu thì chưa ăn).
//
// B5 (Grok CRM 09/10, image_standard.md): mỗi ảnh có ô "Alt (tiếng Việt)"
// 5–15 từ, ≤ 125 ký tự. "Gợi ý" = tên sản phẩm + thông số chính + góc chụp,
// hiện viền nét đứt tím — bấm "Dùng" mới điền (không tự lưu). Alt lấy từ gợi
// ý đánh dấu auto: đổi tên sản phẩm thì gợi ý mới hiện lại; alt tự viết giữ
// nguyên. Lưu theo URL ảnh (image_alts_json) nên đổi thứ tự không lệch.

export type ImageAlt = { alt: string; auto?: boolean };
const ALT_MAX = 125;
const ANGLES = [
  "nhìn từ phía trước",
  "mặt sau",
  "cạnh bên",
  "cổng kết nối",
  "phụ kiện đi kèm",
  "đang sử dụng",
] as const;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function GalleryEditor({
  slug,
  initialUrls,
  initialAlts = {},
  altBase,
}: {
  slug: string;
  initialUrls: string[];
  initialAlts?: Record<string, ImageAlt>;
  // "Tên sản phẩm + thông số chính" cho gợi ý alt.
  altBase: string;
}) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [alts, setAlts] = useState<Record<string, ImageAlt>>(initialAlts);
  // Góc chụp đã chọn theo ảnh (chỉ để dựng gợi ý, không lưu).
  const [angles, setAngles] = useState<Record<string, string>>({});
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function move(index: number, delta: number) {
    setUrls((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    startUpload(async () => {
      for (const file of list) {
        const formData = new FormData();
        // Chuẩn ảnh (11/10): nền trắng, cắt sát, vuông, ≤1024, WebP — ảnh chụp giữ khung.
        formData.set("image", await normalizeProductImage(file));
        const result = await uploadWebsiteProductImage(slug, formData);
        if ("error" in result) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        setUrls((prev) => (prev.length >= 10 ? prev : [...prev, result.url]));
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  const angleOf = (url: string, i: number) => angles[url] ?? (i === 0 ? ANGLES[0] : "");
  const suggestionFor = (url: string, i: number) => {
    const angle = angleOf(url, i);
    return (angle ? `${altBase}, ${angle}` : altBase).slice(0, ALT_MAX);
  };
  const missingCount = urls.filter((u) => !alts[u]?.alt?.trim()).length;
  // Chỉ gửi alt của ảnh còn trong gallery, cắt 125 ký tự.
  const altsOut = Object.fromEntries(
    urls
      .filter((u) => alts[u]?.alt?.trim())
      .map((u) => [u, { alt: alts[u].alt.trim().slice(0, ALT_MAX), auto: !!alts[u].auto }]),
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {urls.map((url, i) => {
          const value = alts[url]?.alt ?? "";
          const suggestion = suggestionFor(url, i);
          const showSuggestion = !value.trim() || (!!alts[url]?.auto && value !== suggestion);
          const words = wordCount(value);
          return (
            <div key={url} className="flex gap-2 rounded-lg border bg-background p-2">
              <div className="group relative size-24 shrink-0 overflow-hidden rounded-md border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail nhỏ trong dialog, khỏi qua next/image */}
                <img src={url} alt={value} className="size-full object-contain p-1" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Đại diện
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-background/85 py-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowLeft className="size-3.5" />
                    <span className="sr-only">Đưa lên trước</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                    <span className="sr-only">Xoá ảnh</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(i, 1)}
                    disabled={i === urls.length - 1}
                  >
                    <ArrowRight className="size-3.5" />
                    <span className="sr-only">Đưa ra sau</span>
                  </Button>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`alt_${i}`} className="text-xs text-muted-foreground">
                    Alt (tiếng Việt)
                  </label>
                  <select
                    value={angleOf(url, i)}
                    onChange={(e) => setAngles((a) => ({ ...a, [url]: e.target.value }))}
                    className="ml-auto h-6 max-w-[9.5rem] rounded border bg-background px-1 text-[11px]"
                    aria-label="Góc chụp"
                  >
                    <option value="">Góc chụp…</option>
                    {ANGLES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  id={`alt_${i}`}
                  value={value}
                  maxLength={ALT_MAX}
                  onChange={(e) => setAlts((a) => ({ ...a, [url]: { alt: e.target.value, auto: false } }))}
                  placeholder="vd: MacBook Air M3 16GB, nhìn từ phía trước"
                  className={cn("h-8 text-sm", !value.trim() && "border-amber-300")}
                />
                {value.trim() && (words < 5 || words > 15) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    {words} từ — nên 5–15 từ, mô tả đúng ảnh, không nhồi &quot;thuê … giá rẻ&quot;.
                  </p>
                )}
                {showSuggestion && altBase && (
                  <div className="flex items-start gap-1.5 rounded-md border border-dashed border-violet-400 bg-violet-50 px-2 py-1 text-xs text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                    <Sparkles className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0 flex-1">{suggestion}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-violet-700 hover:underline dark:text-violet-300"
                      onClick={() => setAlts((a) => ({ ...a, [url]: { alt: suggestion, auto: true } }))}
                    >
                      Dùng
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {urls.length < 10 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <ImagePlus className="size-5" />
            <span className="text-[11px] font-medium">{uploading ? "Đang tải..." : "Thêm ảnh"}</span>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ảnh đầu tiên là ảnh đại diện. Tối đa 10 ảnh, mỗi ảnh ≤ 5MB — tự chuẩn hoá nền trắng, vuông, tối đa 1024px. Xoá/đổi thứ tự/alt chỉ ăn khi bấm Lưu.
        {missingCount > 0 && (
          <span className="text-amber-700 dark:text-amber-300"> · {missingCount} ảnh chưa có alt.</span>
        )}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input type="hidden" name="gallery_json" value={JSON.stringify(urls)} />
      <input type="hidden" name="image_alts_json" value={JSON.stringify(altsOut)} />
    </div>
  );
}
