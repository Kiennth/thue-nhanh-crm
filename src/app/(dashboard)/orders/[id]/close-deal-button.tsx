"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Handshake, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeOrderDeal } from "@/lib/actions/orders";

// Phương án C (CEO 2026-10-03): 3 khâu đầu (Tiếp nhận yêu cầu → Báo giá →
// Chốt đơn) là thủ tục — 1 nút hoàn thành hết khâu còn dở cho 1 người phụ
// trách (mặc định người đang đăng nhập) thay vì chọn người + Lưu 3 lần.
export function CloseDealButton({
  orderId,
  employees,
  defaultEmployeeId,
}: {
  orderId: string;
  employees: { id: string; name: string }[];
  defaultEmployeeId: string | null;
}) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? employees[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await closeOrderDeal(orderId, employeeId);
      if (result && "error" in result) toast.error(result.error);
      else toast.success("Đã chốt đơn");
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
        aria-label="Người phụ trách 3 khâu đầu"
      >
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={handleClick} disabled={pending || !employeeId}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />}
        Chốt đơn (3 khâu đầu)
      </Button>
    </div>
  );
}
