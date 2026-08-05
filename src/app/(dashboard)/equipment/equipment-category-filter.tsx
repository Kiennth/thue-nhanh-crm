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

interface CategoryOption {
  id: string;
  name: string;
}

const ALL_VALUE = "all";

export function EquipmentCategoryFilter({
  categories,
  value,
}: {
  categories: CategoryOption[];
  value: string | null;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === ALL_VALUE) {
      params.delete("category");
    } else {
      params.set("category", next);
    }
    params.delete("page");
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(v) => handleChange(v ?? ALL_VALUE)}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Lọc theo danh mục">
          {(v: string) =>
            v === ALL_VALUE ? "Tất cả danh mục" : (categories.find((c) => c.id === v)?.name ?? "—")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Tất cả danh mục</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
