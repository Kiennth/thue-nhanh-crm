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
