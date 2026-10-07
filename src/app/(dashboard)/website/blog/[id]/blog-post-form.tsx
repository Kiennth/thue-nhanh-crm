"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Send, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BLOG_CATEGORIES, slugifyVi, type BlogPostRow } from "@/lib/blog";
import { deleteBlogPost, saveBlogPost, uploadBlogImage, type BlogActionState } from "@/lib/actions/blog";
import { BlogEditor, shrinkImage } from "../blog-editor";

// datetime-local theo giờ VN.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export function BlogPostForm({
  post,
  categories,
  webUrl,
}: {
  post: BlogPostRow;
  categories: { slug: string; name: string; isParent: boolean }[];
  webUrl: string;
}) {
  const [state, action, pending] = useActionState<BlogActionState, FormData>(saveBlogPost.bind(null, post.id), undefined);
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  // Bài nháp chưa từng đăng: đường dẫn tự theo tiêu đề cho tới khi sửa tay.
  const [slugTouched, setSlugTouched] = useState(post.status === "published");
  const [cover, setCover] = useState(post.cover_image_url ?? "");
  const [seoDesc, setSeoDesc] = useState(post.seo_description ?? "");
  const [related, setRelated] = useState<string[]>(post.related_category_slugs ?? []);
  const [uploading, startUpload] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state) return;
    if ("error" in state) toast.error(state.error);
    else toast.success(state.message);
  }, [state]);

  function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startUpload(async () => {
      const fd = new FormData();
      fd.set("image", await shrinkImage(file));
      const r = await uploadBlogImage(fd);
      if ("error" in r) toast.error(r.error);
      else setCover(r.url);
    });
  }

  const published = post.status === "published";
  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Tiêu đề bài (H1)</Label>
          <Input
            id="title"
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugifyVi(e.target.value));
            }}
            className="text-lg font-semibold"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="excerpt">Tóm tắt (hiện ở danh sách bài, 1–2 câu)</Label>
          <Textarea id="excerpt" name="excerpt" rows={2} maxLength={400} defaultValue={post.excerpt ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>Nội dung</Label>
          <BlogEditor name="content_html" defaultValue={post.content_html} />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Trạng thái</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                published
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
              )}
            >
              {published ? "Đã đăng" : "Nháp"}
            </span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="published_at" className="text-xs">
              Giờ đăng (trống = đăng ngay)
            </Label>
            <Input id="published_at" name="published_at" type="datetime-local" defaultValue={toLocalInput(post.published_at)} />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
              <Save className="size-4" /> {published ? "Gỡ về nháp" : "Lưu nháp"}
            </Button>
            <Button type="submit" name="intent" value="publish" disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">
              <Send className="size-4" /> {published ? "Cập nhật" : "Đăng bài"}
            </Button>
          </div>
          {published && (
            <a
              href={`${webUrl}/blog/${post.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Xem trên web <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="category">Chuyên mục</Label>
          <select
            id="category"
            name="category"
            defaultValue={post.category}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          >
            {BLOG_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Ảnh đại diện</Label>
          {cover ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="aspect-[16/9] w-full rounded object-cover" />
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute right-1 top-1"
                onClick={() => setCover("")}
                title="Bỏ ảnh"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" disabled={uploading} onClick={() => coverRef.current?.click()}>
              <ImagePlus className="size-4" /> {uploading ? "Đang tải..." : "Chọn ảnh (16:9)"}
            </Button>
          )}
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
          <input type="hidden" name="cover_image_url" value={cover} />
          <Input name="cover_alt" placeholder="Mô tả ảnh, vd: Loa JBL tại hội trường 100 khách" defaultValue={post.cover_alt ?? ""} />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Thiết bị liên quan (cuối bài)</Label>
          <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
            {categories.map((c) => {
              const on = related.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setRelated(on ? related.filter((s) => s !== c.slug) : [...related, c.slug])}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    on ? "border-sky-600 bg-sky-600 text-white" : "hover:bg-muted",
                    c.isParent && !on && "font-semibold",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {related.map((s) => (
            <input key={s} type="hidden" name="related_category_slugs" value={s} />
          ))}
        </div>

        <fieldset className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
          <legend className="px-1 text-sm font-semibold text-sky-800 dark:text-sky-300">SEO Google</legend>
          <div className="space-y-1">
            <Label htmlFor="slug" className="text-xs">
              Đường dẫn: /blog/…
            </Label>
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
            {published && <p className="text-xs text-amber-700">Bài đã đăng — đổi đường dẫn sẽ làm hỏng link cũ.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="seo_title" className="text-xs">
              Tiêu đề trên Google (trống = tiêu đề bài)
            </Label>
            <Input id="seo_title" name="seo_title" maxLength={120} defaultValue={post.seo_title ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="seo_description" className="text-xs">
              Mô tả trên Google ({seoDesc.length}/160)
            </Label>
            <Textarea
              id="seo_description"
              name="seo_description"
              rows={3}
              maxLength={400}
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="author_name" className="text-xs">
              Tác giả
            </Label>
            <Input id="author_name" name="author_name" defaultValue={post.author_name} />
          </div>
        </fieldset>

        <div className="pt-2">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => startDelete(() => deleteBlogPost(post.id))}
              >
                <Trash2 className="size-4" /> Xoá hẳn
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Thôi
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Xoá bài
            </Button>
          )}
        </div>
      </aside>
    </form>
  );
}
