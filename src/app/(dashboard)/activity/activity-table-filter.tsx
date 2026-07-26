"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITY_TABLE_OPTIONS } from "@/lib/activity-labels";

export function ActivityTableFilter({ value }: { value: string }) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === "all") {
      params.delete("table");
    } else {
      params.set("table", next);
    }
    params.delete("page");
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "all")}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Lọc theo đối tượng">
          {(v: string) =>
            v === "all" ? "Tất cả đối tượng" : ACTIVITY_TABLE_OPTIONS.find((o) => o.value === v)?.label
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả đối tượng</SelectItem>
        {ACTIVITY_TABLE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
