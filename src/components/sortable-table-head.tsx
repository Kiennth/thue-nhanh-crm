"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";

// Bấm lần 1 → tăng dần, lần 2 → giảm dần, lần 3 → bỏ sắp xếp (về mặc định
// của trang) — xoay vòng 3 trạng thái thay vì chỉ đảo asc/desc. Dùng chung
// "sort"/"dir" trên URL — mỗi trang chỉ có 1 cột đang sắp xếp tại 1 thời điểm.
export function SortableTableHead({
  sortKey,
  label,
  className,
}: {
  sortKey: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSort = searchParams.get("sort");
  const activeDir = searchParams.get("dir") === "desc" ? "desc" : "asc";
  const isActive = activeSort === sortKey;

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    if (!isActive) {
      params.set("sort", sortKey);
      params.set("dir", "asc");
    } else if (activeDir === "asc") {
      params.set("sort", sortKey);
      params.set("dir", "desc");
    } else {
      params.delete("sort");
      params.delete("dir");
    }
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {isActive && activeDir === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className={isActive ? "size-3" : "size-3 text-muted-foreground/40"} />
        )}
      </button>
    </TableHead>
  );
}
