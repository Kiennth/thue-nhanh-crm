"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendReminderTest } from "@/lib/actions/reminders";

export function TestSendButton({ branchId }: { branchId: string | null }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendReminderTest(branchId);
          if (r.error) toast.error(r.error);
          else toast.success(`Đã gửi thử tới ${r.to}`);
        })
      }
    >
      {pending ? "Đang gửi..." : "Gửi thử cho tôi"}
    </Button>
  );
}
