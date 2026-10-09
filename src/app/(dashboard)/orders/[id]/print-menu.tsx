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

function openInNewTab(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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
            // Mở chứng từ ở TAB MỚI, giữ nguyên trang đơn (CEO 2026-10-04).
            // <Link target="_blank"> trong menu bị chặn → vẫn chuyển trang cũ;
            // window.open(…, features) bị nhiều trình duyệt coi là popup (Safari/
            // app cài từ web chuyển luôn trang hiện tại). Bấm 1 thẻ <a> thật
            // target=_blank — trình duyệt nào cũng mở tab mới như bấm link.
            onClick={() => openInNewTab(`/orders/${orderId}/print?type=${docType}`)}
          >
            {PRINT_DOC_MENU_LABELS[docType]}
          </DropdownMenuItem>
        ))}
        {/* Báo giá tiếng Anh cho khách nước ngoài (CEO 2026-10-09). */}
        <DropdownMenuItem onClick={() => openInNewTab(`/orders/${orderId}/print?type=quote&lang=en`)}>
          Tạo báo giá (English)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
