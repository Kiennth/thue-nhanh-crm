"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadWebsiteProductImage } from "@/lib/actions/website";

// Quản lý gallery ảnh sản phẩm web (CEO 2026-08-17): lưới thumbnail, upload
// từ máy (nhiều file), xoá, mũi tên đổi thứ tự — ảnh ĐẦU TIÊN là ảnh đại
// diện trên thẻ sản phẩm. Danh sách cuối cùng đi theo form qua hidden input
// gallery_json khi bấm Lưu (xoá/đổi thứ tự chưa bấm Lưu thì chưa ăn).
export function GalleryEditor({ slug, initialUrls }: { slug: string; initialUrls: string[] }) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
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
        formData.set("image", file);
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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {urls.map((url, i) => (
          <div key={url} className="group relative overflow-hidden rounded-lg border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail nhỏ trong dialog, khỏi qua next/image */}
            <img src={url} alt="" className="aspect-square w-full object-contain p-1" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Đại diện
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-background/85 py-0.5 opacity-0 transition group-hover:opacity-100">
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
        ))}
        {urls.length < 10 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <ImagePlus className="size-5" />
            <span className="text-[11px] font-medium">{uploading ? "Đang tải..." : "Thêm ảnh"}</span>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ảnh đầu tiên là ảnh đại diện. Tối đa 10 ảnh, mỗi ảnh ≤ 5MB. Xoá/đổi thứ tự chỉ ăn khi bấm Lưu.
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
    </div>
  );
}
