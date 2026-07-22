"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function PeriodPicker({
  paramName,
  type,
  value,
  label,
}: {
  paramName: string;
  type: "date" | "month" | "number";
  value: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(newValue: string) {
    if (!newValue) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, newValue);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Input
      key={value}
      type={type}
      defaultValue={value}
      aria-label={label}
      className="w-32"
      min={type === "number" ? 2000 : undefined}
      max={type === "number" ? 2100 : undefined}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
