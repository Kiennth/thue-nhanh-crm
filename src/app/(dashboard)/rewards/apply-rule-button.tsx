"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyRewardRule } from "@/lib/actions/rewards";

// Nút "Trao ngay" (doanh_so) / "Áp kỳ này" (dinh_ky) — action tự chặn áp
// trùng trong tháng nên bấm đúp cũng không sinh khoản kép.
export function ApplyRuleButton({
  ruleId,
  month,
  label,
}: {
  ruleId: string;
  month: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleApply() {
    startTransition(async () => {
      const result = await applyRewardRule(ruleId, month);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Đã ghi khoản thưởng vào sổ.");
      }
    });
  }

  return (
    <Button size="sm" disabled={pending} onClick={handleApply}>
      {pending ? "Đang ghi..." : label}
    </Button>
  );
}
