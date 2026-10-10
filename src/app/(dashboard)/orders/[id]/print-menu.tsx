"use client";

import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRINT_DOC_MENU_LABELS, PRINT_DOC_TYPES, PRINT_DOC_TYPES_EN, type PrintDocType } from "@/lib/print-docs";

// Bản tiếng Anh cho khách nước ngoài: báo giá (CEO 2026-10-09), các chứng từ
// còn lại (CEO 2026-10-10) — hợp đồng in song ngữ Việt–Anh.
const EN_MENU_LABELS: Partial<Record<PrintDocType, string>> = {
  quote: "Báo giá",
  contract: "Hợp đồng (song ngữ Việt–Anh)",
  payment_request: "Đề nghị thanh toán",
  handover: "Biên bản bàn giao",
  acceptance: "Biên bản nghiệm thu",
};

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
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>English</DropdownMenuLabel>
          {PRINT_DOC_TYPES_EN.map((docType) => (
            <DropdownMenuItem
              key={docType}
              onClick={() => openInNewTab(`/orders/${orderId}/print?type=${docType}&lang=en`)}
            >
              {EN_MENU_LABELS[docType]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
