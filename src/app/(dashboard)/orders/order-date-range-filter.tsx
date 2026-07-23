"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DATE_RANGE_PRESET_OPTIONS } from "@/lib/date-range-presets";

export function OrderDateRangeFilter({
  preset,
  from,
  to,
}: {
  preset: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: { range?: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.range !== undefined) {
      if (!next.range || next.range === "all") {
        params.delete("range");
      } else {
        params.set("range", next.range);
      }
      if (next.range !== "custom") {
        params.delete("from");
        params.delete("to");
      }
    }
    if (next.from !== undefined) {
      if (next.from) params.set("from", next.from);
      else params.delete("from");
    }
    if (next.to !== undefined) {
      if (next.to) params.set("to", next.to);
      else params.delete("to");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => updateParams({ range: v ?? "all" })}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Khoảng thời gian">
            {(v: string) => DATE_RANGE_PRESET_OPTIONS.find((o) => o.value === v)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_PRESET_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <>
          <Input
            key={`from-${from}`}
            type="date"
            aria-label="Từ ngày"
            className="w-40"
            defaultValue={from}
            onChange={(e) => updateParams({ from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input
            key={`to-${to}`}
            type="date"
            aria-label="Đến ngày"
            className="w-40"
            defaultValue={to}
            onChange={(e) => updateParams({ to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
