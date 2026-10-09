import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExternalLink, PenLine } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { BLOG_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { BLOG_CATEGORIES, type BlogPostRow } from "@/lib/blog";
import { createBlogPost } from "@/lib/actions/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";

const WEB = process.env.WEBSITE_PUBLIC_URL ?? "https://thuenhanh.vn";

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
}

// Bài "đã đăng" nhưng giờ đăng còn ở tương lai = hẹn giờ.
function isFuture(iso: string | null) {
  return !!iso && new Date(iso).getTime() > Date.now();
}

// Danh sách bài blog web (CEO 2026-10-08).
const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const STATUS_FILTERS = [
  { key: "", label: "Tất cả" },
  { key: "draft", label: "Nháp" },
  { key: "published", label: "Đã đăng" },
] as const;

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireRole([...BLOG_ROLES]);
  const { q, status } = await searchParams;
  const query = q?.trim() ?? "";
  const activeStatus = status === "draft" || status === "published" ? status : "";
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db
    .from("blog_posts")
    .select("id, slug, title, category, status, published_at, updated_at, cover_image_url")
    .order("updated_at", { ascending: false });
  const posts = (data ?? []) as Pick<
    BlogPostRow,
    "id" | "slug" | "title" | "category" | "status" | "published_at" | "updated_at" | "cover_image_url"
  >[];
  const catName = (s: string) => BLOG_CATEGORIES.find((c) => c.slug === s)?.name ?? s;
  // Tìm theo tiêu đề (bỏ dấu) + lọc trạng thái (đề xuất CRM v2 §4.7).
  const needle = fold(query);
  const count = (st: string) => posts.filter((p) => !st || p.status === st).length;
  const shown = posts.filter(
    (p) => (!activeStatus || p.status === activeStatus) && (!query || fold(`${p.title} ${p.slug}`).includes(needle)),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Blog</h1>
        <p className="text-sm text-muted-foreground">
          Bài viết hiện ở {WEB.replace(/^https?:\/\//, "")}/blog. Chia bài bằng “Tiêu đề lớn” — web tự làm mục lục.
        </p>
      </div>

      <form action={createBlogPost} className="flex max-w-2xl gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <Input name="title" required placeholder="Tiêu đề bài mới, vd: Cách chọn loa cho sự kiện 100 khách" className="bg-background" />
        <Button type="submit" className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
          <PenLine className="size-4" /> Viết bài mới
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput key={query} paramName="q" placeholder="Tìm bài theo tiêu đề — gõ rồi Enter..." value={query} className="w-full max-w-md" />
        <div className="inline-flex rounded-lg border p-1">
          {STATUS_FILTERS.map((f) => {
            const p = new URLSearchParams();
            if (query) p.set("q", query);
            if (f.key) p.set("status", f.key);
            const qs = p.toString();
            return (
              <Link
                key={f.key}
                href={`/website/blog${qs ? `?${qs}` : ""}`}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium",
                  activeStatus === f.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {f.label} <span className="opacity-70">{count(f.key)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{posts.length ? "Không có bài nào khớp." : "Chưa có bài nào."}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {shown.map((p) => {
            const scheduled = p.status === "published" && isFuture(p.published_at);
            return (
              <div key={p.id} className="flex items-center gap-3 p-3">
                {p.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_image_url} alt="" className="size-14 shrink-0 rounded object-cover" />
                ) : (
                  <div className="size-14 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/website/blog/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-semibold",
                        p.status === "draft"
                          ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          : scheduled
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                      )}
                    >
                      {p.status === "draft" ? "Nháp" : scheduled ? `Hẹn đăng ${fmt(p.published_at)}` : "Đã đăng"}
                    </span>
                    <span>{catName(p.category)}</span>
                    <span>· sửa {fmt(p.updated_at)}</span>
                  </div>
                </div>
                {p.status === "published" && !scheduled && (
                  <a
                    href={`${WEB}/blog/${p.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Xem <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
