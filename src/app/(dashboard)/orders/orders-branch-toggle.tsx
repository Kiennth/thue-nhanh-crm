"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";

// Toggle chọn kho cho Giám đốc/Admin/Kế toán (CEO yêu cầu 2026-08-13) — đặt
// cạnh toggle kỳ nhưng phạm vi RỘNG HƠN: quét cả khối tổng quan LẪN bảng
// danh sách theo kho đang chọn (toggle kỳ chỉ đổi khối tổng quan). Mặc định
// "Tất cả kho" không ghi vào URL — giữ URL sạch như các filter khác.
export function OrdersBranchToggle({
  branches,
  value,
}: {
  branches: { id: string; name: string }[];
  value: string | null;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("branch", next);
    } else {
      params.delete("branch");
    }
    params.delete("page");
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1">
      <Button
        type="button"
        size="sm"
        variant={value === null ? "default" : "ghost"}
        className="h-7 px-2.5 text-xs"
        onClick={() => handleChange(null)}
      >
        Tất cả kho
      </Button>
      {branches.map((b) => (
        <Button
          key={b.id}
          type="button"
          size="sm"
          variant={value === b.id ? "default" : "ghost"}
          className="h-7 px-2.5 text-xs"
          onClick={() => handleChange(b.id)}
        >
          Kho {b.name}
        </Button>
      ))}
    </div>
  );
}
