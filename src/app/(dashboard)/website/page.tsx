import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { SearchInput } from "@/components/search-input";
import { PaginationControls } from "@/components/pagination-controls";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { WebsiteProductRowActions, RefreshWebsiteButton } from "./row-actions";
import { WebsiteProductDialog } from "./product-dialog";
import { WebsiteCategoryDialog } from "./category-dialog";

const PAGE_SIZE = 30;

// Quản trị nội dung web công khai new.thuenhanh.vn (CEO yêu cầu 2026-08-16).
// Nội dung nằm ở bảng website_* cùng Supabase — sửa xong web tự làm mới qua
// /api/revalidate (action gọi giúp, không cần deploy).
export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string; page?: string }>;
}) {
  await requireRole([...MANAGE_ROLES]);
  const { search, filter, page } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const activeFilter = filter ?? "all";
  const currentPage = Math.max(1, Number(page) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("website_products")
    .select("*, equipment_types(name, price, rental_period_unit, image_url)", { count: "exact" })
    .order("is_published", { ascending: false })
    .order("sort_order")
    .order("slug");
  if (activeFilter === "published") query = query.eq("is_published", true);
  if (activeFilter === "draft") query = query.eq("is_published", false);
  if (activeFilter === "featured") query = query.eq("is_featured", true);
  if (activeFilter === "new") query = query.eq("is_new", true);
  if (activeFilter === "no-category") query = query.is("website_category_id", null);
  if (activeSearch) {
    // Slug toàn chữ không dấu nên phải bỏ dấu tiếng Việt trước khi so
    // ("kính" → "kinh"), kèm tìm cả tên marketing (có dấu). Bỏ ký tự đặc
    // biệt của cú pháp or= PostgREST để chuỗi tìm không phá filter.
    const cleaned = activeSearch.toLowerCase().replace(/[,()"\\]/g, " ").trim();
    const slugTerm = cleaned
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/\s+/g, "-");
    query = query.or(`slug.ilike.%${slugTerm}%,name.ilike.%${cleaned}%`);
  }

  const [{ data: products, count }, { data: categories }, statsRes, leadRes, allLiteRes] =
    await Promise.all([
      query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      supabase.from("website_categories").select("*").order("sort_order"),
      supabase.from("website_products").select("is_published, is_featured, is_new, website_category_id"),
      supabase.from("website_leads").select("id", { count: "exact", head: true }),
      // Danh sách nhẹ cho bộ chọn "sản phẩm liên quan" trong dialog (tên
      // hiển thị = tên marketing, trống thì tên CRM).
      supabase
        .from("website_products")
        .select("id, name, slug, equipment_types(name)")
        .order("slug"),
    ]);

  const rows = products ?? [];
  const categoryList = categories ?? [];
  const relatedOptions = (allLiteRes.data ?? []).map((p) => ({
    id: p.id,
    label: p.name ?? (p.equipment_types as unknown as { name: string } | null)?.name ?? p.slug,
  }));
  const all = statsRes.data ?? [];
  const publishedCount = all.filter((p) => p.is_published).length;
  const noCategoryCount = all.filter((p) => !p.website_category_id).length;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filterLink = (f: string, label: string) => (
    <Link
      href={f === "all" ? "/website" : `/website?filter=${f}`}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        activeFilter === f ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Website</h1>
        <div className="flex items-center gap-2">
          <Link href="/website/leads" className="text-sm font-medium text-primary hover:underline">
            Khách hỏi thuê ({leadRes.count ?? 0})
          </Link>
          <RefreshWebsiteButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Đang hiện trên web" value={publishedCount} />
        <StatCard label="Đang ẩn" value={all.length - publishedCount} />
        <StatCard label="Thuê nhiều nhất" value={all.filter((p) => p.is_featured).length} />
        <StatCard label="Sản phẩm mới" value={all.filter((p) => p.is_new).length} />
        <StatCard label="Chưa có danh mục" value={noCategoryCount} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Danh mục web ({categoryList.length})</CardTitle>
          <WebsiteCategoryDialog parents={categoryList.filter((c) => !c.parent_id)} />
        </CardHeader>
        <CardContent className="space-y-2">
          {/* 2 tầng: mỗi dòng = nhóm cha + các con của nó */}
          {categoryList
            .filter((c) => !c.parent_id)
            .map((parent) => (
              <div key={parent.id} className="flex flex-wrap items-center gap-2">
                <WebsiteCategoryDialog category={parent} parents={categoryList.filter((c) => !c.parent_id)} />
                <span className="text-muted-foreground">›</span>
                {categoryList
                  .filter((c) => c.parent_id === parent.id)
                  .map((child) => (
                    <WebsiteCategoryDialog
                      key={child.id}
                      category={child}
                      parents={categoryList.filter((c) => !c.parent_id)}
                    />
                  ))}
              </div>
            ))}
          {!categoryList.length && (
            <p className="text-sm text-muted-foreground">Chưa có danh mục web nào.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm theo tên hoặc slug..."
          value={activeSearch}
          resetParams={["page"]}
        />
        {filterLink("all", "Tất cả")}
        {filterLink("published", "Đang hiện")}
        {filterLink("draft", "Đang ẩn")}
        {filterLink("featured", "Thuê nhiều nhất")}
        {filterLink("new", "Sản phẩm mới")}
        {filterLink("no-category", "Chưa có danh mục")}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead className="w-40">Danh mục web</TableHead>
            <TableHead className="w-28">Nội dung</TableHead>
            <TableHead className="w-24">Trạng thái</TableHead>
            <TableHead className="w-40"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const et = p.equipment_types as unknown as {
              name: string;
              price: number;
              rental_period_unit: string | null;
              image_url: string | null;
            } | null;
            const displayName = p.name ?? et?.name ?? p.slug;
            const hasImage = p.gallery_image_urls.length > 0 || Boolean(et?.image_url);
            const category = categoryList.find((c) => c.id === p.website_category_id);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">/{p.slug}</p>
                </TableCell>
                <TableCell className="text-sm">
                  {category?.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {!hasImage && <Badge variant="destructive">Thiếu ảnh</Badge>}
                    {!p.description_html && <Badge variant="outline">Thiếu mô tả</Badge>}
                    {p.description_html && !p.description_html_en && (
                      <Badge variant="outline">Thiếu EN</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.is_published ? "default" : "secondary"}>
                    {p.is_published ? "Đang hiện" : "Ẩn"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <WebsiteProductDialog
                      product={p}
                      categories={categoryList}
                      relatedOptions={relatedOptions}
                    />
                    <WebsiteProductRowActions
                      id={p.id}
                      slug={p.slug}
                      isPublished={p.is_published}
                      isFeatured={p.is_featured}
                      isNew={p.is_new}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Không có sản phẩm nào khớp bộ lọc.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PaginationControls
        page={currentPage}
        totalPages={totalPages}
        totalCount={count ?? 0}
        itemLabel="sản phẩm"
      />
    </div>
  );
}
