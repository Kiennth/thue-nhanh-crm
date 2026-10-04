"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOrderBranches } from "@/lib/actions/orders";
import { cn } from "@/lib/utils";

// Đổi chi nhánh ngay trên trang đơn, 1 chạm (CEO 2026-10-04): bấm kho giao
// thì kho thu hồi đi theo; "Thu hồi kho khác" mới chọn riêng.
export function BranchQuickSwitch({
  orderId,
  branches,
  pickupBranchId,
  returnBranchId,
  pickupLocked,
}: {
  orderId: string;
  branches: { id: string; name: string }[];
  pickupBranchId: string;
  returnBranchId: string;
  // Đã xuất kho: không đổi kho giao (lệch tồn), chỉ đổi kho thu hồi.
  pickupLocked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [showReturn, setShowReturn] = useState(returnBranchId !== pickupBranchId);

  function save(pickup: string, ret: string) {
    if (pickup === pickupBranchId && ret === returnBranchId) return;
    startTransition(async () => {
      const result = await updateOrderBranches(orderId, pickup, ret);
      if (result && "error" in result) toast.error(result.error);
      else toast.success("Đã đổi chi nhánh");
    });
  }

  const pills = (value: string, onPick: (id: string) => void, disabled: boolean) => (
    <div className="flex flex-wrap gap-1">
      {branches.map((b) => (
        <button
          key={b.id}
          type="button"
          disabled={pending || (disabled && b.id !== value)}
          onClick={() => onPick(b.id)}
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            value === b.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary",
          )}
        >
          {b.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-1.5">
      {pills(
        pickupBranchId,
        (id) => save(id, showReturn ? returnBranchId : id),
        pickupLocked,
      )}
      {pickupLocked && <p className="text-[11px] text-muted-foreground">Đã xuất kho — chỉ đổi được kho thu hồi.</p>}
      {showReturn ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Thu hồi tại</p>
          {pills(returnBranchId, (id) => save(pickupBranchId, id), false)}
          {!pickupLocked && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => {
                setShowReturn(false);
                save(pickupBranchId, pickupBranchId);
              }}
            >
              Thu hồi cùng kho giao
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setShowReturn(true)}>
          Thu hồi kho khác
        </button>
      )}
    </div>
  );
}
