// Blog web thuenhanh.vn (CEO 2026-10-08) — dùng chung CRM. Danh sách chuyên
// mục khớp CHECK của blog_posts.category (migration 20261008120000) và bản
// sao bên repo web (src/lib/blog.ts).
export const BLOG_CATEGORIES = [
  { slug: "kinh-nghiem-to-chuc-su-kien", name: "Kinh nghiệm tổ chức sự kiện" },
  { slug: "huong-dan-chon-thiet-bi", name: "Hướng dẫn chọn thiết bị" },
  { slug: "quay-phim-livestream", name: "Quay phim & livestream" },
  { slug: "gia-thue-so-sanh", name: "Giá thuê & so sánh" },
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]["slug"];

export type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  seo_description: string | null;
  excerpt: string | null;
  content_html: string;
  cover_image_url: string | null;
  cover_alt: string | null;
  category: BlogCategorySlug;
  related_category_slugs: string[];
  author_name: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

// "Cách chọn loa cho sự kiện 100 khách" → "cach-chon-loa-cho-su-kien-100-khach"
export function slugifyVi(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}
