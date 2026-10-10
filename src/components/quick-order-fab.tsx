"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { QuickOrderDialog } from "@/app/(dashboard)/orders/quick-order-dialog";

// Nút nổi "+ Tạo đơn" góc phải dưới ở mọi trang (CEO 2026-10-04, giữ lại khi
// làm B2 ngày 10/10 — không bỏ như Grok đề xuất) — mở đúng popup Tạo đơn của
// trang Đơn hàng, khỏi phải chuyển trang. Phím tắt N (đang không gõ chữ,
// không có hộp thoại nào mở) cũng mở popup này.
export function QuickOrderFab({ branches }: { branches: { id: string; name: string }[] }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      buttonRef.current?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QuickOrderDialog
      branches={branches}
      trigger={
        <button
          ref={buttonRef}
          type="button"
          aria-label="Tạo đơn (phím N)"
          title="Tạo đơn (phím N)"
          aria-keyshortcuts="N"
          className="group fixed right-6 bottom-6 z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:outline-none print:hidden"
        >
          <Plus className="size-6" strokeWidth={2.5} />
          <span className="hidden pr-1 text-[15px] font-bold sm:inline">Tạo đơn</span>
          <kbd className="hidden rounded bg-white/20 px-1.5 text-[11px] font-semibold lg:inline">N</kbd>
        </button>
      }
    />
  );
}
