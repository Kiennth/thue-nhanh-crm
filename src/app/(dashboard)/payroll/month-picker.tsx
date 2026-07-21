"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="month">Tháng</Label>
      <Input
        id="month"
        type="month"
        defaultValue={month}
        className="w-40"
        onChange={(e) => {
          if (e.target.value) router.push(`/payroll?month=${e.target.value}`);
        }}
      />
    </div>
  );
}
