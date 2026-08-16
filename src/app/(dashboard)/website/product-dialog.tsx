"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { updateWebsiteProduct } from "@/lib/actions/website";
import type { Database } from "@/types/database";

type WebsiteProductRow = Database["public"]["Tables"]["website_products"]["Row"];
type WebsiteCategoryRow = Database["public"]["Tables"]["website_categories"]["Row"];

// Sửa nội dung 1 sản phẩm web — song ngữ đặt cạnh nhau để đối chiếu nhanh.
// Mô tả nhập HTML thô (mang từ Haravan sang) — người quen sửa chữ thường chỉ
// đổi text giữa các thẻ; làm editor xịn là việc sau nếu cần.
export function WebsiteProductDialog({
  product,
  categories,
}: {
  product: WebsiteProductRow;
  categories: WebsiteCategoryRow[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateWebsiteProduct(product.id, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
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
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Sửa nội dung web</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug (đường dẫn: new.thuenhanh.vn/…)</Label>
            <Input id="slug" name="slug" defaultValue={product.slug} required />
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
              defaultValue={product.website_category_id ?? ""}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">— Chưa phân loại —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
            <Label>Mô tả chi tiết</Label>
            <RichTextEditor
              name="description_html"
              defaultValue={product.description_html ?? ""}
              placeholder="Tiêu đề lớn để chia ô: Cấu hình, Trong hộp, FAQ..."
            />
          </div>

          <div className="space-y-2">
            <Label>Mô tả chi tiết tiếng Anh</Label>
            <RichTextEditor
              name="description_html_en"
              defaultValue={product.description_html_en ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu và cập nhật web"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
