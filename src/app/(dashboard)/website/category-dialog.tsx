"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertWebsiteCategory } from "@/lib/actions/website";
import type { Database } from "@/types/database";

type WebsiteCategoryRow = Database["public"]["Tables"]["website_categories"]["Row"];

// Không có category = nút "Thêm danh mục"; có = chip bấm vào để sửa.
export function WebsiteCategoryDialog({ category }: { category?: WebsiteCategoryRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertWebsiteCategory(category?.id ?? null, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  const trigger = category ? (
    <button type="button" className="cursor-pointer">
      <Badge variant={category.is_published ? "default" : "secondary"}>
        {category.name} · {category.sort_order}
      </Badge>
    </button>
  ) : (
    <Button size="sm" variant="outline">
      <Plus className="size-4" />
      Thêm danh mục
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{category ? `Sửa danh mục: ${category.name}` : "Thêm danh mục web"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Tên</Label>
              <Input id="name" name="name" defaultValue={category?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name_en">Tên tiếng Anh</Label>
              <Input id="name_en" name="name_en" defaultValue={category?.name_en ?? ""} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (vd: thue-macbook)</Label>
              <Input id="slug" name="slug" defaultValue={category?.slug} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Thứ tự</Label>
              <Input id="sort_order" name="sort_order" type="number" defaultValue={category?.sort_order ?? 0} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intro_html">Đoạn giới thiệu SEO đầu trang (HTML)</Label>
            <Textarea
              id="intro_html"
              name="intro_html"
              rows={4}
              className="font-mono text-xs"
              defaultValue={category?.intro_html ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intro_html_en">Đoạn giới thiệu tiếng Anh (HTML)</Label>
            <Textarea
              id="intro_html_en"
              name="intro_html_en"
              rows={4}
              className="font-mono text-xs"
              defaultValue={category?.intro_html_en ?? ""}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={category?.is_published ?? true}
              className="size-4"
            />
            Hiện trên web
          </label>

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
