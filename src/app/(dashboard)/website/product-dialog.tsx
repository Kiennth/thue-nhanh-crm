"use client";

import { useState, useTransition } from "react";
import { Maximize2, Minimize2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/rich-text-editor";
import { GalleryEditor } from "./gallery-editor";
import { RelatedPicker, type RelatedOption } from "./related-picker";
import { SpecFacetsEditor } from "./spec-facets-editor";
import type { SpecFacets } from "@/lib/spec-fields";
import { getWebsiteProductForEdit, updateWebsiteProduct } from "@/lib/actions/website";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type WebsiteProductRow = Database["public"]["Tables"]["website_products"]["Row"];
type WebsiteCategoryRow = Pick<
  Database["public"]["Tables"]["website_categories"]["Row"],
  "id" | "name" | "slug" | "parent_id"
>;

// Nhớ lựa chọn "toàn màn hình" giữa các lần mở (CEO 2026-10-01 muốn khung
// sửa to, thậm chí full screen).
const FULLSCREEN_KEY = "website-product-dialog-fullscreen";
function readFullscreenPref() {
  try {
    return localStorage.getItem(FULLSCREEN_KEY) === "1";
  } catch {
    return false;
  }
}

// Ô chọn danh mục (CEO 2026-10-03): danh mục cha xếp ABC, ngay dưới mỗi cha
// là các con của nó (cũng ABC) ghi "Cha › Con". Con mồ côi (cha đã xoá) đứng
// cuối như danh mục thường.
function categoryOptions(categories: WebsiteCategoryRow[]) {
  const byName = (a: WebsiteCategoryRow, b: WebsiteCategoryRow) => a.name.localeCompare(b.name, "vi");
  const ids = new Set(categories.map((c) => c.id));
  const roots = categories.filter((c) => !c.parent_id || !ids.has(c.parent_id)).sort(byName);
  const options: { id: string; label: string }[] = [];
  for (const root of roots) {
    options.push({ id: root.id, label: root.name });
    for (const child of categories.filter((c) => c.parent_id === root.id).sort(byName)) {
      options.push({ id: child.id, label: `${root.name} › ${child.name}` });
    }
  }
  return options;
}

// Sửa nội dung 1 sản phẩm web — song ngữ đặt cạnh nhau để đối chiếu nhanh.
// Mô tả nhập HTML thô (mang từ Haravan sang) — người quen sửa chữ thường chỉ
// đổi text giữa các thẻ; làm editor xịn là việc sau nếu cần.
export function WebsiteProductDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Nạp đủ sản phẩm (mô tả HTML VI + EN…) lúc MỞ khung sửa — danh sách
  // Website chỉ tải cột nhẹ (Grok CRM 09/10 §A: trang từng nặng ~790KB).
  const [product, setProduct] = useState<WebsiteProductRow | null>(null);
  // Danh sách nhẹ mọi sản phẩm web (id + tên) cho bộ chọn "liên quan" — nạp cùng lúc.
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([]);
  const [categories, setCategories] = useState<WebsiteCategoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    try {
      localStorage.setItem(FULLSCREEN_KEY, next ? "1" : "0");
    } catch {}
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFullscreen(readFullscreenPref());
          setProduct(null);
          setLoadError(null);
          getWebsiteProductForEdit(productId)
            .then((r) => {
              if ("error" in r) return setLoadError(r.error);
              setRelatedOptions(r.relatedOptions);
              setCategories(r.categories);
              setProduct(r.product);
            })
            .catch(() => setLoadError("Không tải được sản phẩm — đóng rồi mở lại."));
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            <Pencil className="size-4" />
            <span className="sr-only">Sửa nội dung</span>
          </Button>
        }
      />
      <DialogContent
        className={cn(
          "overflow-y-auto",
          fullscreen
            ? "h-dvh max-h-dvh w-screen max-w-none rounded-none sm:max-w-none"
            : "max-h-[92vh] sm:max-w-5xl",
        )}
      >
        {product ? (
          <ProductEditForm
            product={product}
            categories={categories}
            relatedOptions={relatedOptions}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            onSaved={() => setOpen(false)}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Sửa nội dung web</DialogTitle>
            <p className={loadError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {loadError ?? "Đang tải sản phẩm…"}
            </p>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductEditForm({
  product,
  categories,
  relatedOptions,
  fullscreen,
  onToggleFullscreen,
  onSaved,
}: {
  product: WebsiteProductRow;
  categories: WebsiteCategoryRow[];
  relatedOptions: RelatedOption[];
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Danh mục đang chọn quyết định nhóm ô "Thông số lọc".
  const [categoryId, setCategoryId] = useState(product.website_category_id ?? "");
  const categorySlug = categories.find((c) => c.id === categoryId)?.slug ?? null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateWebsiteProduct(product.id, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <DialogHeader className="flex-row items-center gap-2 pr-8">
        <DialogTitle>Sửa nội dung web</DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onToggleFullscreen}
          title={fullscreen ? "Thu nhỏ" : "Toàn màn hình"}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          <span className="sr-only">{fullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span>
        </Button>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug (đường dẫn: thuenhanh.vn/…)</Label>
        <Input id="slug" name="slug" defaultValue={product.slug} required />
      </div>

      <div className="space-y-2">
        <Label>Ảnh sản phẩm</Label>
        <GalleryEditor slug={product.slug} initialUrls={product.gallery_image_urls} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Tên hiển thị (trống = dùng tên CRM)</Label>
          <Input id="name" name="name" defaultValue={product.name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name_en">Tên tiếng Anh</Label>
          <Input id="name_en" name="name_en" defaultValue={product.name_en ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website_category_id">Danh mục web</Label>
        <select
          id="website_category_id"
          name="website_category_id"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        >
          <option value="">— Chưa phân loại —</option>
          {categoryOptions(categories).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="short_description">Mô tả ngắn</Label>
          <Textarea
            id="short_description"
            name="short_description"
            rows={2}
            defaultValue={product.short_description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="short_description_en">Mô tả ngắn (EN)</Label>
          <Textarea
            id="short_description_en"
            name="short_description_en"
            rows={2}
            defaultValue={product.short_description_en ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Sản phẩm liên quan (gắn tay, hiện dưới trang sản phẩm)</Label>
        <RelatedPicker
          options={relatedOptions}
          initialIds={product.related_product_ids}
          selfId={product.id}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ship_fee">Phí giao tận nơi cố định (đ) — để trống để web tự tính theo xe máy/ô tô</Label>
        <Input
          id="ship_fee"
          name="ship_fee"
          type="number"
          min={0}
          step="any"
          placeholder="Để trống = tính theo mô hình xe máy/ô tô bên dưới"
          defaultValue={product.ship_fee ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ship_bike_max_qty">
          Ngưỡng xe máy trước khi đổi ô tô (số lượng) — bỏ trống dùng mặc định 5
        </Label>
        <Input
          id="ship_bike_max_qty"
          name="ship_bike_max_qty"
          type="number"
          min={0}
          step={1}
          placeholder="Mặc định 5 — 0 = luôn ô tô, số lớn (999) = không bao giờ cần ô tô"
          defaultValue={product.ship_bike_max_qty ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Bỏ qua nếu đã đặt phí giao cố định ở trên. 0 = đồ cồng kềnh luôn cần ô tô; số lớn (vd 999) = nhẹ, xe máy chở bao nhiêu cũng được (như điện thoại).
        </p>
      </div>

      <SpecFacetsEditor
        key={product.id}
        categorySlug={categorySlug}
        productSlug={product.slug}
        initial={(product.spec_facets ?? {}) as SpecFacets}
      />

      <div className="space-y-2">
        <Label htmlFor="tags_csv">Tags tìm chéo (phân tách bằng dấu phẩy)</Label>
        <Input
          id="tags_csv"
          name="tags_csv"
          placeholder="13 inch, M1 Pro, Thunderbolt 4..."
          defaultValue={product.tags.join(", ")}
        />
      </div>

      {/* Toàn màn hình: 2 bản mô tả VI/EN đặt cạnh nhau để đối chiếu. */}
      <div className={cn("grid gap-4", fullscreen && "lg:grid-cols-2 [&_.prose-editor]:min-h-[45vh]")}>
        <div className="min-w-0 space-y-2">
          <Label>Mô tả chi tiết</Label>
          <RichTextEditor
            name="description_html"
            defaultValue={product.description_html ?? ""}
            placeholder="Tiêu đề lớn để chia ô: Tính năng nổi bật · Thông số kỹ thuật · Trong hộp · Tại sao nên thuê · Video (dán link YouTube)"
          />
        </div>

        <div className="min-w-0 space-y-2">
          <Label>Mô tả chi tiết tiếng Anh</Label>
          <RichTextEditor
            name="description_html_en"
            defaultValue={product.description_html_en ?? ""}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Nút lưu dính đáy khung — mô tả dài không phải cuộn xuống tận cùng. */}
      <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu và cập nhật web"}
        </Button>
      </DialogFooter>
    </form>
  );
}
