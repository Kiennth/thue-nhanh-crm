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
import { getWebsiteCategoryForEdit, upsertWebsiteCategory } from "@/lib/actions/website";
import type { Database } from "@/types/database";

type WebsiteCategoryRow = Database["public"]["Tables"]["website_categories"]["Row"];
// Bản gọn trang Website truyền xuống (không kèm giới thiệu HTML / SEO — Grok
// CRM 09/10 §A: 89 danh mục × đủ cột từng làm trang nặng ~450KB). Khung sửa
// tự nạp đủ cột lúc mở.
export type WebsiteCategoryLite = Pick<
  WebsiteCategoryRow,
  "id" | "name" | "slug" | "parent_id" | "sort_order" | "is_published"
>;

// Không có category = nút "Thêm danh mục"; có = chip bấm vào để sửa.
// parents = các danh mục tầng trên để chọn "Nhóm cha" (2 tầng, CEO 2026-08-17).
export function WebsiteCategoryDialog({
  category,
  parents = [],
  trigger: customTrigger,
}: {
  category?: WebsiteCategoryLite;
  parents?: WebsiteCategoryLite[];
  // Nút mở dialog tuỳ chỉnh (vd tên danh mục trong cây ở trang Website).
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [full, setFull] = useState<WebsiteCategoryRow | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertWebsiteCategory(category?.id ?? null, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  const trigger = customTrigger ?? (category ? (
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
  ));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          if (category) {
            setFull(null);
            getWebsiteCategoryForEdit(category.id)
              .then((r) => ("error" in r ? setError(r.error) : setFull(r.category)))
              .catch(() => setError("Không tải được danh mục — đóng rồi mở lại."));
          }
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {category && !full ? (
          <DialogHeader>
            <DialogTitle>{`Sửa danh mục: ${category.name}`}</DialogTitle>
            <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {error ?? "Đang tải danh mục…"}
            </p>
          </DialogHeader>
        ) : (
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{category ? `Sửa danh mục: ${category.name}` : "Thêm danh mục web"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Tên</Label>
              <Input id="name" name="name" defaultValue={full?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name_en">Tên tiếng Anh</Label>
              <Input id="name_en" name="name_en" defaultValue={full?.name_en ?? ""} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (vd: thue-macbook)</Label>
              <Input id="slug" name="slug" defaultValue={full?.slug} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Thứ tự</Label>
              <Input id="sort_order" name="sort_order" type="number" defaultValue={full?.sort_order ?? 0} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent_id">Nhóm cha (trống = là nhóm tầng trên)</Label>
            <select
              id="parent_id"
              name="parent_id"
              defaultValue={full?.parent_id ?? ""}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">— Không (tầng trên) —</option>
              {parents
                .filter((p) => p.id !== full?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
            <legend className="px-1 text-sm font-semibold text-sky-800 dark:text-sky-300">SEO Google (tiếng Việt)</legend>
            <div className="space-y-2">
              <Label htmlFor="seo_title">Tiêu đề trên Google</Label>
              <Input
                id="seo_title"
                name="seo_title"
                maxLength={120}
                placeholder="Cho thuê iPhone theo ngày tại HCM, Hà Nội"
                defaultValue={full?.seo_title ?? ""}
              />
              <p className="text-xs text-muted-foreground">Web tự thêm “| Thuê Nhanh” phía sau. Nên dưới 48 ký tự. Trống = “Thuê {"{tên}"} giá tốt”.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="h1">Tiêu đề lớn đầu trang (H1)</Label>
              <Input id="h1" name="h1" maxLength={160} placeholder="Cho thuê iPhone mới nhất" defaultValue={full?.h1 ?? ""} />
              <p className="text-xs text-muted-foreground">Trống = dùng tên danh mục.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo_description">Mô tả trên Google (meta description)</Label>
              <Textarea
                id="seo_description"
                name="seo_description"
                rows={3}
                maxLength={400}
                defaultValue={full?.seo_description ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                140–160 ký tự. Viết <code>{"{gia_tu}"}</code> để web tự điền giá thấp nhất, <code>{"{so_mau}"}</code> để điền số mẫu.
                Trống = web tự sinh.
              </p>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="intro_html">Đoạn giới thiệu SEO đầu trang (HTML)</Label>
            <Textarea
              id="intro_html"
              name="intro_html"
              rows={4}
              className="font-mono text-xs"
              defaultValue={full?.intro_html ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intro_html_en">Đoạn giới thiệu tiếng Anh (HTML)</Label>
            <Textarea
              id="intro_html_en"
              name="intro_html_en"
              rows={4}
              className="font-mono text-xs"
              defaultValue={full?.intro_html_en ?? ""}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={full?.is_published ?? true}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
