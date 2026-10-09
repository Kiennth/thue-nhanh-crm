"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { pingWebsiteRevalidate } from "@/lib/website-revalidate";
import { cleanSpecFacets, type SpecFacets } from "@/lib/spec-fields";
import { cleanFaqs, cleanIncludedItems, type Faq } from "@/lib/product-extras";
import type { Database } from "@/types/database";

// Quản trị nội dung web công khai (new.thuenhanh.vn) — bảng website_*.
// RLS đã gate ghi đúng bộ giam_doc/admin/ke_toan từ migration
// 20260816000000_website_catalog; requireRole ở đây chỉ là lớp chặn sớm.

export type ActionState = { error: string } | { success: true } | undefined;

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

// Cờ "Sản phẩm mới" (CEO 2026-08-22) — web hiện dải trên trang chủ + trang
// /san-pham-moi; bật/tắt y hệt Thuê nhiều nhất, làm mới cả 2 trang đó.
export async function toggleProductNew(id: string): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("website_products")
    .select("is_new")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Không tìm thấy sản phẩm web." };
  const { error } = await supabase
    .from("website_products")
    .update({ is_new: !row.is_new })
    .eq("id", id);
  if (error) return { error: "Không đổi được Sản phẩm mới: " + error.message };
  revalidatePath("/website");
  await pingWebsiteRevalidate(["/", "/san-pham-moi", "/en", "/en/san-pham-moi"]);
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
  // Phí giao tận nơi cố định (đ) — trống = web tự tính theo mô hình xe máy/ô tô.
  ship_fee: z
    .union([z.literal("").transform(() => null), z.coerce.number().min(0).max(100_000_000)])
    .optional(),
  // Ngưỡng số lượng xe máy chở tối đa trước khi đổi ô tô — trống = mặc định site-wide.
  ship_bike_max_qty: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(9999)])
    .optional(),
  // Danh sách id sản phẩm liên quan (gắn tay) từ RelatedPicker — JSON mảng uuid.
  related_json: z
    .string()
    .transform((s, ctx) => {
      try {
        const arr = JSON.parse(s);
        if (!Array.isArray(arr) || arr.length > 8) throw new Error();
        if (!arr.every((u) => typeof u === "string" && /^[0-9a-f-]{36}$/i.test(u))) throw new Error();
        return arr as string[];
      } catch {
        ctx.addIssue({ code: "custom", message: "Danh sách liên quan không hợp lệ (tối đa 8)." });
        return z.NEVER;
      }
    })
    .optional(),
  // Tags phân tách bằng dấu phẩy → mảng, lọc rỗng, tối đa 15 tag.
  tags_csv: z
    .string()
    .transform((s) => [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 15))
    .optional(),
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

// Đủ cột của 1 sản phẩm web cho khung "Sửa nội dung web" — nạp lúc mở khung
// (danh sách Website chỉ tải cột nhẹ, Grok CRM 09/10 §A).
export async function getWebsiteProductForEdit(
  id: string,
): Promise<
  | {
      product: Database["public"]["Tables"]["website_products"]["Row"];
      relatedOptions: { id: string; label: string }[];
      categories: { id: string; name: string; slug: string; parent_id: string | null }[];
      // B9: phụ kiện đi kèm của mã ("Sạc | Cable") — gợi ý "Đã gồm gì".
      accessories: string | null;
    }
  | { error: string }
> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const [{ data, error }, { data: lite }, { data: categories }] = await Promise.all([
    supabase.from("website_products").select("*").eq("id", id).maybeSingle(),
    // Bộ chọn "sản phẩm liên quan": tên marketing, trống thì tên CRM.
    supabase.from("website_products").select("id, name, slug, equipment_types(name)").order("slug"),
    supabase.from("website_categories").select("id, name, slug, parent_id").order("sort_order"),
  ]);
  if (error || !data) return { error: "Không tải được sản phẩm: " + (error?.message ?? "không tìm thấy") };
  const relatedOptions = (lite ?? []).map((p) => ({
    id: p.id,
    label: p.name ?? (p.equipment_types as unknown as { name: string } | null)?.name ?? p.slug,
  }));
  const { data: et } = await supabase
    .from("equipment_types")
    .select("default_extra_information")
    .eq("id", data.equipment_type_id)
    .maybeSingle();
  return { product: data, relatedOptions, categories: categories ?? [], accessories: et?.default_extra_information ?? null };
}

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
    tags_csv: formData.get("tags_csv") ?? undefined,
    related_json: formData.get("related_json") || undefined,
    ship_fee: formData.get("ship_fee") ?? undefined,
    ship_bike_max_qty: formData.get("ship_bike_max_qty") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  // Thông số lọc web (spec-fields.ts): kiểm khoảng hợp lệ — chặn "00 inch".
  let specFacets: SpecFacets | undefined;
  const specRaw = formData.get("spec_facets_json");
  if (typeof specRaw === "string" && specRaw) {
    let json: unknown;
    try {
      json = JSON.parse(specRaw);
    } catch {
      return { error: "Thông số lọc không hợp lệ." };
    }
    const cleaned = cleanSpecFacets(json);
    if (!cleaned.ok) return { error: cleaned.error };
    specFacets = cleaned.value;
  }

  // B9: "Đã gồm gì" + FAQ riêng — chặn > 5 dòng / > 3 câu (DB cũng chặn).
  const parseJson = (key: string): { ok: true; value: unknown } | { ok: false } => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || !raw) return { ok: true, value: undefined };
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false };
    }
  };
  let includedItems: string[] | undefined;
  let faqs: Faq[] | undefined;
  {
    const inc = parseJson("included_items_json");
    if (!inc.ok) return { error: "Danh sách 'Đã gồm gì' không hợp lệ." };
    if (inc.value !== undefined) {
      const c = cleanIncludedItems(inc.value);
      if (!c.ok) return { error: c.error };
      includedItems = c.value;
    }
    const fq = parseJson("faqs_json");
    if (!fq.ok) return { error: "FAQ không hợp lệ." };
    if (fq.value !== undefined) {
      const c = cleanFaqs(fq.value);
      if (!c.ok) return { error: c.error };
      faqs = c.value;
    }
  }

  // B5: alt từng ảnh { url: { alt, auto } } — chỉ giữ ảnh còn trong gallery,
  // cắt 125 ký tự (image_standard.md).
  let imageAlts: Record<string, { alt: string; auto: boolean }> | undefined;
  const altsRaw = formData.get("image_alts_json");
  if (typeof altsRaw === "string" && altsRaw) {
    let json: unknown;
    try {
      json = JSON.parse(altsRaw);
    } catch {
      return { error: "Alt ảnh không hợp lệ." };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) return { error: "Alt ảnh không hợp lệ." };
    const keep = parsed.data.gallery_json ? new Set(parsed.data.gallery_json) : null;
    imageAlts = {};
    for (const [url, v] of Object.entries(json as Record<string, { alt?: unknown; auto?: unknown }>)) {
      const alt = typeof v?.alt === "string" ? v.alt.trim().slice(0, 125) : "";
      if (!alt || (keep && !keep.has(url))) continue;
      imageAlts[url] = { alt, auto: v?.auto === true };
    }
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
      ...(parsed.data.tags_csv !== undefined ? { tags: parsed.data.tags_csv } : {}),
      ...(parsed.data.related_json ? { related_product_ids: parsed.data.related_json } : {}),
      ...(parsed.data.ship_fee !== undefined ? { ship_fee: parsed.data.ship_fee } : {}),
      ...(parsed.data.ship_bike_max_qty !== undefined ? { ship_bike_max_qty: parsed.data.ship_bike_max_qty } : {}),
      ...(specFacets !== undefined ? { spec_facets: specFacets } : {}),
      ...(imageAlts !== undefined ? { image_alts: imageAlts } : {}),
      ...(includedItems !== undefined ? { included_items: includedItems } : {}),
      ...(faqs !== undefined ? { faqs } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Không lưu được: " + error.message };

  revalidatePath("/website");
  await pingWebsiteRevalidate();
  return { success: true };
}

// B4: tab "Thông số & web" ở trang mã hàng lưu thẳng vào cùng cột
// website_products.spec_facets với khung sửa Website (1 nguồn, 2 nơi sửa).
export async function saveEquipmentSpecFacets(
  equipmentTypeId: string,
  facets: SpecFacets,
): Promise<{ error: string } | { success: true }> {
  await requireRole([...MANAGE_ROLES]);
  const cleaned = cleanSpecFacets(facets);
  if (!cleaned.ok) return { error: cleaned.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_products")
    .update({ spec_facets: cleaned.value })
    .eq("equipment_type_id", equipmentTypeId)
    .select("id");
  if (error) return { error: "Không lưu được thông số: " + error.message };
  if (!data?.length) return { error: "Mã này chưa có trang web." };
  revalidatePath("/website");
  revalidatePath(`/equipment/${equipmentTypeId}`);
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
  // SEO tiếng Việt (CEO 2026-10-08). Mô tả/giới thiệu viết được "{gia_tu}",
  // "{so_mau}" — web tự điền giá thấp nhất + số mẫu.
  seo_title: z.string().trim().max(120).optional(),
  h1: z.string().trim().max(160).optional(),
  seo_description: z.string().trim().max(400).optional(),
  parent_id: z.string().uuid().optional(),
});

// Đủ cột 1 danh mục web cho khung sửa — nạp lúc mở (trang Website chỉ tải
// bản gọn, Grok CRM 09/10 §A).
export async function getWebsiteCategoryForEdit(
  id: string,
): Promise<{ category: Database["public"]["Tables"]["website_categories"]["Row"] } | { error: string }> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("website_categories").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "Không tải được danh mục: " + (error?.message ?? "không tìm thấy") };
  return { category: data };
}

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
    seo_title: formData.get("seo_title") || undefined,
    h1: formData.get("h1") || undefined,
    seo_description: formData.get("seo_description") || undefined,
    parent_id: formData.get("parent_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  // B9: FAQ chung của danh mục (≤ 3).
  let categoryFaqs: Faq[] | undefined;
  const faqsRaw = formData.get("faqs_json");
  if (typeof faqsRaw === "string" && faqsRaw) {
    let json: unknown;
    try {
      json = JSON.parse(faqsRaw);
    } catch {
      return { error: "FAQ không hợp lệ." };
    }
    const c = cleanFaqs(json);
    if (!c.ok) return { error: c.error };
    categoryFaqs = c.value;
  }

  const supabase = await createClient();
  const values = {
    ...(categoryFaqs !== undefined ? { faqs: categoryFaqs } : {}),
    name: parsed.data.name,
    name_en: parsed.data.name_en ?? null,
    slug: parsed.data.slug,
    sort_order: parsed.data.sort_order,
    is_published: parsed.data.is_published,
    intro_html: parsed.data.intro_html ?? null,
    intro_html_en: parsed.data.intro_html_en ?? null,
    seo_title: parsed.data.seo_title ?? null,
    h1: parsed.data.h1 ?? null,
    seo_description: parsed.data.seo_description ?? null,
    // Không cho tự làm cha chính mình — DB cũng chặn vòng qua FK nhưng chặn sớm.
    parent_id: parsed.data.parent_id && parsed.data.parent_id !== id ? parsed.data.parent_id : null,
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
