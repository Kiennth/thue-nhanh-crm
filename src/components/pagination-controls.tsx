"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  itemLabel: string;
  paramName?: string;
}

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  itemLabel,
  paramName = "page",
}: PaginationControlsProps) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) {
      params.delete(paramName);
    } else {
      params.set(paramName, String(next));
    }
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (totalCount === 0) return null;

  // Số trang (đề xuất CRM v2): 1 … trang-1 trang trang+1 … cuối.
  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Trang {page}/{totalPages} · {new Intl.NumberFormat("vi-VN").format(totalCount)} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          Trước
        </Button>
        {totalPages > 1 &&
          pages.map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={p}
                type="button"
                variant={p === page ? "default" : "outline"}
                size="sm"
                className="min-w-8 px-2 tabular-nums"
                onClick={() => goToPage(p)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </Button>
            ),
          )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          Sau
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
