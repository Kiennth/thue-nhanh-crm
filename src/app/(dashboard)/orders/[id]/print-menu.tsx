"use client";

import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRINT_DOC_MENU_LABELS, PRINT_DOC_TYPES } from "@/lib/print-docs";

export function PrintMenu({ orderId }: { orderId: string }) {
  const trigger = (
    <Button variant="outline" size="sm">
      <FileText className="size-4" />
      Tạo chứng từ
      <ChevronDown className="size-4" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent>
        {PRINT_DOC_TYPES.map((docType) => (
          <DropdownMenuItem
            key={docType}
            // Mở chứng từ ở TAB MỚI, giữ nguyên trang đơn (CEO 2026-10-04) —
            // render <Link target="_blank"> bị menu chặn mặc định, vẫn chuyển
            // trang cũ, nên mở tab bằng tay.
            onClick={() =>
              window.open(`/orders/${orderId}/print?type=${docType}`, "_blank", "noopener,noreferrer")
            }
          >
            {PRINT_DOC_MENU_LABELS[docType]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
