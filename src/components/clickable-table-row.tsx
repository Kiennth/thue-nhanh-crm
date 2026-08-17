"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Cho cả dòng bấm được để đi tới trang chi tiết, không chỉ riêng ô tên —
// bấm vào nút/link/dialog khác trong dòng (xoá, sửa...) vẫn hoạt động bình
// thường vì được loại trừ qua closest("button, a").
//
// [role='listbox'] loại trừ luôn popup Select/Combobox — các popup này
// portal thẳng ra document.body (KHÔNG lồng trong DOM subtree của
// [role='dialog']) nên chỉ closest("[role='dialog']") không chặn được, dù
// sự kiện click vẫn nổi bọt lên onClick này qua cây React (portal chỉ tách
// biệt về DOM, không tách biệt về sự kiện React) — bug thật đã gặp: chọn 1
// mục trong Select bên trong dialog Sửa lại điều hướng nhầm sang trang chi
// tiết của dòng đang mở dialog.
export function ClickableTableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <TableRow
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [role='dialog'], [role='listbox'], [role='option']")) return;
        // Vẫn còn 1 đường lọt (bug CEO gặp 2026-08-17): chọn xong 1 mục trong
        // Select của dialog Sửa → popup đóng NGAY trong lúc sự kiện còn nổi
        // bọt → target lúc này là backdrop/node đã tháo khỏi DOM, closest ở
        // trên không khớp gì → điều hướng nhầm sang trang chi tiết. Chốt
        // chặn cuối: màn hình đang có dialog/popup mở thì click này chắc
        // chắn là tương tác với popup, không phải ý định mở trang chi tiết.
        if (document.querySelector("[role='dialog'], [role='listbox'], [role='alertdialog']")) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
