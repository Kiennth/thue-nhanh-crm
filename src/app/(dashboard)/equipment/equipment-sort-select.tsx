"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EQUIPMENT_SORT_OPTIONS } from "@/lib/equipment-labels";

export function EquipmentSortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === "name_asc") {
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "name_asc")}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Sắp xếp">
          {(v: string) => EQUIPMENT_SORT_OPTIONS.find((o) => o.value === v)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {EQUIPMENT_SORT_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
