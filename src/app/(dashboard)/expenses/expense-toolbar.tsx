"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy } from "lucide-react";
import { copyExpensesFromPreviousMonth } from "@/lib/actions/expenses";
import type { ExpensePeriod } from "@/lib/expense-reports";

const PERIOD_LABELS: Record<ExpensePeriod, string> = {
  month: "Theo tháng",
  quarter: "Theo quý",
  year: "Theo năm",
};

export function ExpensePeriodFilter({ value }: { value: ExpensePeriod }) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "month") params.delete("period");
    else params.set("period", next);
    start();
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "month")}>
      <SelectTrigger className="w-36">
        <SelectValue>{(v: string) => PERIOD_LABELS[v as ExpensePeriod]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERIOD_LABELS) as ExpensePeriod[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PERIOD_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Đổ lại toàn bộ khoản cố định của tháng trước (thuê nhà, internet...) rồi
// kế toán chỉ sửa số điện nước — thay cho cơ chế "khoản lặp" chạy ngầm.
export function CopyLastMonthButton({ month }: { month: string }) {
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await copyExpensesFromPreviousMonth(month);
      if (result && "error" in result) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: "Đã chép các khoản chi từ tháng trước." });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        <Copy className="size-4" /> {pending ? "Đang chép..." : "Chép từ tháng trước"}
      </Button>
      {message && (
        <p
          className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
