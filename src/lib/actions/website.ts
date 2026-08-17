"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";

// Quản trị nội dung web công khai (new.thuenhanh.vn) — bảng website_*.
// RLS đã gate ghi đúng bộ giam_doc/admin/ke_toan từ migration
// 20260816000000_website_catalog; requireRole ở đây chỉ là lớp chặn sớm.

export type ActionState = { error: string } | { success: true } | undefined;

// Sau khi sửa nội dung: gọi web tự làm mới trang tĩnh — không cần deploy.
// Best effort: web không revalidate được thì tự hết hạn ISR sau 1 tiếng.
async function pingWebsiteRevalidate(paths?: string[]) {
  const base = process.env.WEBSITE_PUBLIC_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!base || !secret) return;
  await fetch(`${base}/api/revalidate?secret=${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paths?.length ? { paths } : {}),
  }).catch(() => {});
}

export async function toggleProductPublished(id: string): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("website_products")
    .select("is_published, slug")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Không tìm thấy sản phẩm web." };
  const { error } = await supabase
    .from("website_products")
    .update({ is_published: !row.is_published })
    .eq("id", id);
  if (error) return { error: "Không đổi được trạng thái: " + error.message };
  revalidatePath("/website");
  await pingWebsiteRevalidate();
  return { success: true };
}

export async function toggleProductFeatured(id: string): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("website_products")
    .select("is_featured")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Không tìm thấy sản phẩm web." };
  const { error } = await supabase
    .from("website_products")
    .update({ is_featured: !row.is_featured })
    .eq("id", id);
  if (error) return { error: "Không đổi được featured: " + error.message };
  revalidatePath("/website");
  await pingWebsiteRevalidate(["/"]);
  return { success: true };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GALLERY_MAX = 10;

// Upload 1 ảnh gallery — trả URL để client thêm vào danh sách (lưu thứ tự
// khi bấm Lưu). Dùng ADMIN client cho storage: policy bucket cũ chỉ cho
// admin/ke_toan, nhưng Giám đốc cũng phải up được ảnh web — requireRole ở
// đây mới là lớp gác thật.
export async function uploadWebsiteProductImage(
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireRole([...MANAGE_ROLES]);

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Chưa chọn ảnh." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Ảnh không được vượt quá 5MB." };
  if (!file.type.startsWith("image/")) return { error: "File không phải ảnh." };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: "Slug không hợp lệ." };

  const ext = (file.name.includes(".") ? file.name.split(".").pop() : "jpg") ?? "jpg";
  const path = `website/${slug}/${crypto.randomUUID()}.${ext.toLowerCase()}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("equipment-images")
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: "Không tải được ảnh lên: " + error.message };

  return { url: admin.storage.from("equipment-images").getPublicUrl(path).data.publicUrl };
}

const ProductSchema = z.object({
  name: z.string().trim().max(300).optional(),
  name_en: z.string().trim().max(300).optional(),
  slug: z
    .string()
    .trim()
    .min(3)
    .regex(/^[a-z0-9-]+$/, { message: "Slug chỉ gồm chữ thường không dấu, số và dấu gạch." }),
  short_description: z.string().trim().max(500).optional(),
  short_description_en: z.string().trim().max(500).optional(),
  description_html: z.string().trim().max(50000).optional(),
  description_html_en: z.string().trim().max(50000).optional(),
  website_category_id: z.string().uuid().optional(),
  // JSON string từ GalleryEditor — mảng URL theo thứ tự hiển thị (ảnh đầu
  // là ảnh đại diện). Chỉ nhận URL trong bucket của mình, chặn hotlink lạ.
  gallery_json: z
    .string()
    .transform((s, ctx) => {
      try {
        const arr = JSON.parse(s);
        if (!Array.isArray(arr) || arr.length > GALLERY_MAX) throw new Error();
        if (!arr.every((u) => typeof u === "string" && u.includes("/storage/v1/object/public/equipment-images/"))) {
          throw new Error();
        }
        return arr as string[];
      } catch {
        ctx.addIssue({ code: "custom", message: `Gallery không hợp lệ (tối đa ${GALLERY_MAX} ảnh).` });
        return z.NEVER;
      }
    })
    .optional(),
});

export async function updateWebsiteProduct(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = ProductSchema.safeParse({
    name: formData.get("name") || undefined,
    name_en: formData.get("name_en") || undefined,
    slug: formData.get("slug"),
    short_description: formData.get("short_description") || undefined,
    short_description_en: formData.get("short_description_en") || undefined,
    description_html: formData.get("description_html") || undefined,
    description_html_en: formData.get("description_html_en") || undefined,
    website_category_id: formData.get("website_category_id") || undefined,
    gallery_json: formData.get("gallery_json") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("website_products")
    .update({
      name: parsed.data.name ?? null,
      name_en: parsed.data.name_en ?? null,
      slug: parsed.data.slug,
      short_description: parsed.data.short_description ?? null,
      short_description_en: parsed.data.short_description_en ?? null,
      description_html: parsed.data.description_html ?? null,
      description_html_en: parsed.data.description_html_en ?? null,
      website_category_id: parsed.data.website_category_id ?? null,
      ...(parsed.data.gallery_json ? { gallery_image_urls: parsed.data.gallery_json } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Không lưu được: " + error.message };

  revalidatePath("/website");
  await pingWebsiteRevalidate();
  return { success: true };
}

const CategorySchema = z.object({
  name: z.string().trim().min(1, { message: "Tên danh mục không được trống." }).max(200),
  name_en: z.string().trim().max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(3)
    .regex(/^[a-z0-9-]+$/, { message: "Slug chỉ gồm chữ thường không dấu, số và dấu gạch." }),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_published: z.coerce.boolean(),
  intro_html: z.string().trim().max(20000).optional(),
  intro_html_en: z.string().trim().max(20000).optional(),
});

export async function upsertWebsiteCategory(
  id: string | null,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    name_en: formData.get("name_en") || undefined,
    slug: formData.get("slug"),
    sort_order: formData.get("sort_order") ?? 0,
    is_published: formData.get("is_published") === "on",
    intro_html: formData.get("intro_html") || undefined,
    intro_html_en: formData.get("intro_html_en") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const values = {
    name: parsed.data.name,
    name_en: parsed.data.name_en ?? null,
    slug: parsed.data.slug,
    sort_order: parsed.data.sort_order,
    is_published: parsed.data.is_published,
    intro_html: parsed.data.intro_html ?? null,
    intro_html_en: parsed.data.intro_html_en ?? null,
  };
  const { error } = id
    ? await supabase.from("website_categories").update(values).eq("id", id)
    : await supabase.from("website_categories").insert(values);
  if (error) return { error: "Không lưu được danh mục: " + error.message };

  revalidatePath("/website");
  await pingWebsiteRevalidate();
  return { success: true };
}

// Trả void + throw khi lỗi — khớp chữ ký ConfirmDeleteButton (cùng kiểu
// deleteEquipmentCategory).
export async function deleteWebsiteLead(id: string): Promise<void> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("website_leads").delete().eq("id", id);
  if (error) {
    throw new Error("Không xoá được liên hệ: " + error.message);
  }
  revalidatePath("/website/leads");
}

// Nút "Cập nhật web ngay" — ép toàn site làm mới tức thì.
export async function refreshWebsiteNow(): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);
  const base = process.env.WEBSITE_PUBLIC_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!base || !secret) return { error: "Thiếu WEBSITE_PUBLIC_URL / WEBSITE_REVALIDATE_SECRET trong env." };
  const res = await fetch(`${base}/api/revalidate?secret=${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);
  if (!res?.ok) return { error: "Web không phản hồi revalidate." };
  return { success: true };
}
