"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { cn } from "@/lib/utils";

export function OrdersToHandleLateToggle({
  paramName,
  count,
  active,
}: {
  paramName: string;
  count: number;
  active: boolean;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!active && count === 0) return null;

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete(paramName);
    } else {
      params.set(paramName, "1");
    }
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
        active
          ? "bg-destructive text-destructive-foreground"
          : "bg-destructive/10 text-destructive hover:bg-destructive/20",
      )}
    >
      {active ? `Trễ hạn (${count}) ×` : `Trễ hạn (${count})`}
    </button>
  );
}
