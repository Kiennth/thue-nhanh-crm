"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Cửa hàng trưởng mặc định chỉ thấy đơn kho mình để khỏi loãng việc, nhưng
// vẫn chủ động mở rộng ra toàn hệ thống khi cần hỗ trợ kho khác. Mặc định là
// "kho mình" nên trạng thái đó KHÔNG ghi vào URL — chỉ ghi khi xem tất cả.
export function OrderBranchScopeFilter({
  value,
  branchName,
}: {
  value: "branch" | "all";
  branchName: string;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.set("scope", "all");
    } else {
      params.delete("scope");
    }
    params.delete("page");
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "branch")}>
      <SelectTrigger className="w-56">
        {/* Select ở dự án này nhận hàm render nhãn (giống OrderStatusFilter);
            thiếu nó thì trigger hiện thẳng giá trị thô "branch"/"all". */}
        <SelectValue placeholder="Phạm vi chi nhánh">
          {(v: string) => (v === "all" ? "Tất cả chi nhánh" : `Kho ${branchName}`)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="branch">Kho {branchName}</SelectItem>
        <SelectItem value="all">Tất cả chi nhánh</SelectItem>
      </SelectContent>
    </Select>
  );
}
