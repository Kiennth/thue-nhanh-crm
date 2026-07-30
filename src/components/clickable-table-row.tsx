"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Cho cả dòng bấm được để đi tới trang chi tiết, không chỉ riêng ô tên —
// bấm vào nút/link/dialog khác trong dòng (xoá, sửa...) vẫn hoạt động bình
// thường vì được loại trừ qua closest("button, a").
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
        if (target.closest("button, a, [role='dialog']")) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
