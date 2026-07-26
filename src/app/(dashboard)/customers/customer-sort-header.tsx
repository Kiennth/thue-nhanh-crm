"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

// Bấm lần 1 → tăng dần, lần 2 → giảm dần, lần 3 → bỏ sắp xếp (về mặc định
// theo ngày tạo mới nhất) — xoay vòng 3 trạng thái thay vì chỉ đảo asc/desc.
export function CustomerSortHeader({
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
        {isActive ? (
          activeDir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}
