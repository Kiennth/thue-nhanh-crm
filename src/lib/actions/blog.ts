"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { pingWebsiteRevalidate } from "@/lib/website-revalidate";
import { BLOG_CATEGORIES, slugifyVi } from "@/lib/blog";

// Blog web (CEO 2026-10-08) — bảng blog_posts, RLS giam_doc/admin/ke_toan
// (migration 20261008120000); requireRole ở đây chỉ là lớp chặn sớm.

export type BlogActionState = { error: string } | { success: true; message: string } | undefined;

async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

// Slug chưa ai dùng: thêm -2, -3… nếu trùng.
async function uniqueSlug(supabase: SupabaseClient, base: string, exceptId?: string): Promise<string> {
  const root = base || "bai-viet";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    let q = supabase.from("blog_posts").select("id").eq("slug", slug);
    if (exceptId) q = q.neq("id", exceptId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
  }
  return `${root}-${Date.now()}`;
}

export async function createBlogPost(formData: FormData) {
  const employee = await requireRole([...MANAGE_ROLES]);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const supabase = await db();
  const slug = await uniqueSlug(supabase, slugifyVi(title));
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({ title, slug, created_by: employee.id })
    .select("id")
    .single();
  if (error || !data) throw new Error("Không tạo được bài: " + (error?.message ?? ""));
  revalidatePath("/website/blog");
  redirect(`/website/blog/${data.id}`);
}

const PostSchema = z.object({
  title: z.string().trim().min(1, { message: "Tiêu đề không được trống." }).max(200),
  slug: z
    .string()
    .trim()
    .min(3, { message: "Đường dẫn quá ngắn." })
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch." }),
  category: z.enum(BLOG_CATEGORIES.map((c) => c.slug) as [string, ...string[]]),
  excerpt: z.string().trim().max(400).optional(),
  content_html: z.string().max(400_000),
  cover_image_url: z.string().trim().url().optional(),
  cover_alt: z.string().trim().max(200).optional(),
  seo_title: z.string().trim().max(120).optional(),
  seo_description: z.string().trim().max(400).optional(),
  author_name: z.string().trim().min(1).max(120),
  related_category_slugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(12),
  // "draft" = lưu nháp (gỡ khỏi web nếu đang đăng), "publish" = đăng/cập nhật.
  intent: z.enum(["draft", "publish"]),
  // Hẹn giờ đăng (giờ VN, dạng datetime-local); trống = đăng ngay.
  published_at: z.string().trim().optional(),
});

export async function saveBlogPost(
  id: string,
  _prev: BlogActionState,
  formData: FormData,
): Promise<BlogActionState> {
  await requireRole([...MANAGE_ROLES]);
  const parsed = PostSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    category: formData.get("category"),
    excerpt: formData.get("excerpt") || undefined,
    content_html: formData.get("content_html") ?? "",
    cover_image_url: formData.get("cover_image_url") || undefined,
    cover_alt: formData.get("cover_alt") || undefined,
    seo_title: formData.get("seo_title") || undefined,
    seo_description: formData.get("seo_description") || undefined,
    author_name: formData.get("author_name") || "Nguyễn Trung Kiên – Thuê Nhanh",
    related_category_slugs: formData.getAll("related_category_slugs").map(String),
    intent: formData.get("intent"),
    published_at: formData.get("published_at") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const d = parsed.data;
  const supabase = await db();

  const { data: clash } = await supabase.from("blog_posts").select("id").eq("slug", d.slug).neq("id", id).maybeSingle();
  if (clash) return { error: "Đường dẫn này đã có bài khác dùng — đổi đường dẫn khác." };

  const { data: current } = await supabase.from("blog_posts").select("slug, status, published_at").eq("id", id).maybeSingle();
  if (!current) return { error: "Không tìm thấy bài." };

  let publishedAt: string | null = current.published_at as string | null;
  if (d.intent === "publish") {
    // datetime-local là giờ VN (không kèm múi) → gắn +07:00.
    publishedAt = d.published_at
      ? new Date(`${d.published_at}:00+07:00`).toISOString()
      : (publishedAt ?? new Date().toISOString());
  }

  const { error } = await supabase
    .from("blog_posts")
    .update({
      title: d.title,
      slug: d.slug,
      category: d.category,
      excerpt: d.excerpt ?? null,
      content_html: d.content_html,
      cover_image_url: d.cover_image_url ?? null,
      cover_alt: d.cover_alt ?? null,
      seo_title: d.seo_title ?? null,
      seo_description: d.seo_description ?? null,
      author_name: d.author_name,
      related_category_slugs: d.related_category_slugs,
      status: d.intent === "publish" ? "published" : "draft",
      published_at: publishedAt,
    })
    .eq("id", id);
  if (error) return { error: "Không lưu được bài: " + error.message };

  revalidatePath("/website/blog");
  revalidatePath(`/website/blog/${id}`);
  // Đang/đã đăng thì làm mới web (cả slug cũ nếu đổi đường dẫn).
  if (d.intent === "publish" || current.status === "published") await pingWebsiteRevalidate();
  return {
    success: true,
    message: d.intent === "publish" ? "Đã đăng bài lên web." : "Đã lưu nháp (chưa hiện trên web).",
  };
}

export async function deleteBlogPost(id: string) {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await db();
  const { data } = await supabase.from("blog_posts").select("status").eq("id", id).maybeSingle();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error("Không xoá được bài: " + error.message);
  if (data?.status === "published") await pingWebsiteRevalidate();
  revalidatePath("/website/blog");
  redirect("/website/blog");
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Ảnh trong bài + ảnh đại diện → bucket equipment-images/blog/ (admin client
// vì policy bucket cũ chỉ cho admin/ke_toan — xem uploadWebsiteProductImage).
export async function uploadBlogImage(formData: FormData): Promise<{ url: string } | { error: string }> {
  await requireRole([...MANAGE_ROLES]);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Chưa chọn ảnh." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Ảnh không được vượt quá 5MB." };
  if (!file.type.startsWith("image/")) return { error: "File không phải ảnh." };
  const rawExt = (file.name.includes(".") ? file.name.split(".").pop() : "jpg") ?? "jpg";
  const ext = /^[a-z0-9]{1,5}$/i.test(rawExt) ? rawExt.toLowerCase() : "jpg";
  const path = `blog/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("equipment-images")
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: "Không tải được ảnh lên: " + error.message };
  return { url: admin.storage.from("equipment-images").getPublicUrl(path).data.publicUrl };
}
