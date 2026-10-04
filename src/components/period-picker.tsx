"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/date-input";

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
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(newValue: string) {
    if (!newValue) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, newValue);
    start();
    router.push(`${pathname}?${params.toString()}`);
  }

  if (type === "date") {
    return (
      <DateInput
        key={value}
        defaultValue={value}
        aria-label={label}
        className="w-36"
        onChange={(e) => handleChange(e.target.value)}
      />
    );
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
