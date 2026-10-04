"use client";

import { Plus } from "lucide-react";
import { QuickOrderDialog } from "@/app/(dashboard)/orders/quick-order-dialog";

// Nút nổi "Tạo đơn nhanh" góc phải dưới ở mọi trang (CEO 2026-10-04) — mở
// đúng popup Tạo đơn nhanh của trang Đơn hàng, khỏi phải chuyển trang.
export function QuickOrderFab({ branches }: { branches: { id: string; name: string }[] }) {
  return (
    <QuickOrderDialog
      branches={branches}
      trigger={
        <button
          type="button"
          aria-label="Tạo đơn nhanh"
          title="Tạo đơn nhanh"
          className="group fixed right-6 bottom-6 z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:outline-none print:hidden"
        >
          <Plus className="size-6" strokeWidth={2.5} />
          <span className="hidden pr-1 text-[15px] font-bold sm:inline">Tạo đơn nhanh</span>
        </button>
      }
    />
  );
}
