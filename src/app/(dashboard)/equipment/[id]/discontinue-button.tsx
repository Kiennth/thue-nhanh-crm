"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setEquipmentTypeDiscontinued } from "@/lib/actions/equipment";

// Dừng / mở lại kinh doanh mã hàng (CEO 2026-10-09).
export function DiscontinueButton({ id, discontinued }: { id: string; discontinued: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (
      !discontinued &&
      !window.confirm("Dừng kinh doanh mã này? Nhân viên sẽ không tìm thấy khi lên đơn. Đơn cũ giữ nguyên, mở lại được bất cứ lúc nào.")
    ) {
      return;
    }
    startTransition(async () => {
      const res = await setEquipmentTypeDiscontinued(id, !discontinued);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(discontinued ? "Đã mở lại kinh doanh." : "Đã dừng kinh doanh.");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : discontinued ? <RotateCcw /> : <Ban />}
      {discontinued ? "Mở lại kinh doanh" : "Dừng kinh doanh"}
    </Button>
  );
}
