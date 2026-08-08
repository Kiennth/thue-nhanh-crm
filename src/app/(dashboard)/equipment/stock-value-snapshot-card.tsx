"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { RevenueBarList, type RevenuePoint } from "@/components/revenue-bar-list";
import { Button } from "@/components/ui/button";

type Snapshot = "current" | "endOfLastMonth" | "endOfLastYear";

const SNAPSHOT_OPTIONS: { value: Snapshot; label: string }[] = [
  { value: "current", label: "Hiện tại" },
  { value: "endOfLastMonth", label: "Cuối tháng trước" },
  { value: "endOfLastYear", label: "Cuối năm trước" },
];

// "Hàng hoá chiếm nhiều vốn tồn kho nhất" là cơ cấu TẠI 1 THỜI ĐIỂM (khác
// "Tăng/giảm trong tháng" — biến động giữa 2 mốc) nên toggle theo kiểu "tại
// thời điểm" chứ không phải "trong kỳ" (tuần này/tháng này...). CEO chốt
// 2026-08-06 để Kế toán/Giám đốc so sánh cơ cấu vốn tồn kho qua các mốc.
// Toggle cục bộ (không qua URL) vì cả 3 mốc đã tính sẵn từ server, không cần
// gọi lại dữ liệu khi đổi.
//
// Mốc "Hiện tại" lấy từ RPC (equipment_stock sống, chính xác). 2 mốc quá khứ
// buộc phải DỰNG LẠI từ lịch sử equipment_purchases — bảng này gần như trống
// với hàng cũ (kiểm tra 2026-08-06: 162/164 loại đang có tồn kho nhưng 0
// dòng ghi nhận mua, vì được nhập thẳng vào equipment_stock lúc setup ban
// đầu, chưa từng ghi purchase). Nên 2 mốc quá khứ CHỈ phản ánh phần hàng có
// ghi nhận mua — số thực tế hồi đó cao hơn nhiều. CEO đã biết và chấp nhận
// ship kèm cảnh báo này thay vì chờ bổ sung dữ liệu.
export function StockValueSnapshotCard({
  current,
  endOfLastMonth,
  endOfLastYear,
}: {
  current: RevenuePoint[];
  endOfLastMonth: RevenuePoint[];
  endOfLastYear: RevenuePoint[];
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>("current");
  const pointsBySnapshot: Record<Snapshot, RevenuePoint[]> = {
    current,
    endOfLastMonth,
    endOfLastYear,
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Hàng hoá chiếm nhiều vốn tồn kho nhất</p>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1">
          {SNAPSHOT_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={snapshot === o.value ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setSnapshot(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
      {snapshot !== "current" && (
        <p className="mb-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Số liệu quá khứ dựng lại từ lịch sử mua hàng — nhiều hàng cũ nhập
          kho trước khi hệ thống ghi nhận mua nên KHÔNG có trong danh sách
          này, số thực tế hồi đó cao hơn.
        </p>
      )}
      <RevenueBarList points={pointsBySnapshot[snapshot]} labelWidthClassName="w-32" />
    </div>
  );
}
