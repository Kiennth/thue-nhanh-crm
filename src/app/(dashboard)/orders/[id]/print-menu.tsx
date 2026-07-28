"use client";

import Link from "next/link";
import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRINT_DOC_MENU_LABELS, type PrintDocType } from "@/lib/print-docs";

const DOC_TYPES: PrintDocType[] = ["contract", "quote", "handover", "collection", "acceptance"];

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
        {DOC_TYPES.map((docType) => (
          <DropdownMenuItem
            key={docType}
            render={
              <Link
                href={`/orders/${orderId}/print?type=${docType}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            {PRINT_DOC_MENU_LABELS[docType]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
