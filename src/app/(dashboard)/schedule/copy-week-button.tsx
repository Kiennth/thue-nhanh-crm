"use client";

import { useTransition } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyPreviousWeek } from "@/lib/actions/work-shifts";

export function CopyWeekButton({ weekStart, employeeIds }: { weekStart: string; employeeIds: string[] }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyPreviousWeek(weekStart, employeeIds);
          if ("error" in r) toast.error(r.error);
          else toast.success(r.copied ? `Đã chép ${r.copied} ca từ tuần trước` : "Tuần trước không có ca nào để chép (hoặc đã xếp đủ)");
        })
      }
    >
      <Copy className="size-4" />
      Chép lịch tuần trước
    </Button>
  );
}
