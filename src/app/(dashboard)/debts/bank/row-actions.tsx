"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignBankTransaction, setBankTransactionIgnored } from "@/lib/actions/bank";

// Gán giao dịch chưa khớp vào đơn: gõ mã đơn → Ghi. "Chỉ là cọc" khi khách
// chuyển riêng tiền ký quỹ mà quên ghi COC.
export function BankRowActions({
  transactionId,
  status,
  suggestedCode,
}: {
  transactionId: string;
  status: "unmatched" | "ignored";
  suggestedCode: string | null;
}) {
  const [code, setCode] = useState(suggestedCode ?? "");
  const [depositOnly, setDepositOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  if (status === "ignored") {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setBankTransactionIgnored(transactionId, false);
            if ("error" in r) toast.error(r.error);
          })
        }
      >
        Bỏ đánh dấu
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Mã đơn (DH… / BQ…)"
        className="h-8 w-40 font-mono text-xs"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={depositOnly} onChange={(e) => setDepositOnly(e.target.checked)} />
        Chỉ là cọc
      </label>
      <Button
        size="sm"
        disabled={pending || !code.trim()}
        onClick={() =>
          startTransition(async () => {
            const r = await assignBankTransaction(transactionId, code, depositOnly);
            if ("error" in r) toast.error(r.error);
            else toast.success(r.message ?? "Đã ghi vào đơn");
          })
        }
      >
        Ghi vào đơn
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        title="Không phải tiền đơn hàng (lãi, hoàn tiền NCC...)"
        onClick={() =>
          startTransition(async () => {
            const r = await setBankTransactionIgnored(transactionId, true);
            if ("error" in r) toast.error(r.error);
          })
        }
      >
        Bỏ qua
      </Button>
    </div>
  );
}
