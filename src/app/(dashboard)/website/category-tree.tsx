import Link from "next/link";
import { EyeOff, FolderOpen, Tag } from "lucide-react";
import { WebsiteCategoryDialog, type WebsiteCategoryLite } from "./category-dialog";

// Danh mục web dạng cây (CEO 2026-10-04): nhóm cha → các con thụt vào có
// đường nối. Bấm tên = sửa danh mục, bấm số SP = lọc bảng sản phẩm bên dưới.
export function WebsiteCategoryTree({
  categories,
  productCategoryIds,
  activeId,
}: {
  categories: WebsiteCategoryLite[];
  productCategoryIds: (string | null)[];
  activeId: string | null;
}) {
  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);
  const ownCount = new Map<string, number>();
  for (const id of productCategoryIds) if (id) ownCount.set(id, (ownCount.get(id) ?? 0) + 1);

  if (!categories.length) {
    return <p className="text-sm text-muted-foreground">Chưa có danh mục web nào.</p>;
  }

  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
      {parents.map((parent) => {
        const children = childrenOf(parent.id);
        const total =
          (ownCount.get(parent.id) ?? 0) + children.reduce((s, c) => s + (ownCount.get(c.id) ?? 0), 0);
        return (
          <div key={parent.id} className="mb-4 break-inside-avoid rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-5 shrink-0 text-primary" />
              <WebsiteCategoryDialog
                category={parent}
                parents={parents}
                trigger={
                  <button
                    type="button"
                    className={`min-w-0 cursor-pointer truncate text-left text-[15px] font-bold hover:underline ${
                      parent.is_published ? "" : "text-muted-foreground"
                    }`}
                  >
                    {parent.name}
                  </button>
                }
              />
              <Meta category={parent} count={total} active={activeId === parent.id} />
            </div>
            {children.length > 0 && (
              <ul className="mt-2 ml-2.5 border-l-2 border-border">
                {children.map((child) => (
                  <li key={child.id} className="relative flex items-center gap-2 py-1 pl-5">
                    <span aria-hidden className="absolute top-1/2 left-0 w-4 border-t-2 border-border" />
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                    <WebsiteCategoryDialog
                      category={child}
                      parents={parents}
                      trigger={
                        <button
                          type="button"
                          className={`min-w-0 cursor-pointer truncate text-left text-sm font-medium hover:underline ${
                            child.is_published ? "" : "text-muted-foreground"
                          }`}
                        >
                          {child.name}
                        </button>
                      }
                    />
                    <Meta category={child} count={ownCount.get(child.id) ?? 0} active={activeId === child.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Meta({
  category,
  count,
  active,
}: {
  category: WebsiteCategoryLite;
  count: number;
  active: boolean;
}) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {!category.is_published && (
        <span title="Đang ẩn trên web" className="text-muted-foreground">
          <EyeOff className="size-3.5" />
        </span>
      )}
      <span className="text-[11px] text-muted-foreground tabular-nums" title="Thứ tự hiển thị">
        #{category.sort_order}
      </span>
      <Link
        href={active ? "/website" : `/website?cat=${category.id}`}
        title="Lọc sản phẩm thuộc danh mục này"
        className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
          active ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-border hover:ring-primary"
        }`}
      >
        {count} SP
      </Link>
    </span>
  );
}
