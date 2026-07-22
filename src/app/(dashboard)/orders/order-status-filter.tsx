"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STATUS_FILTER_OPTIONS } from "@/lib/order-labels";

export function OrderStatusFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === "all") {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "all")}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Lọc theo trạng thái">
          {(v: string) => ORDER_STATUS_FILTER_OPTIONS.find((o) => o.value === v)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ORDER_STATUS_FILTER_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
