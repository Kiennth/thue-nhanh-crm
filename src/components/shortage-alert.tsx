import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { loadShortages } from "@/lib/shortage";

// Thanh báo trang chủ (CEO 2026-10-04): 7 ngày tới có mã nào thiếu máy.
export async function ShortageAlert() {
  const items = await loadShortages(7);
  if (!items.length) return null;
  const missing = items.reduce((s, x) => s + x.missing, 0);
  const names = items
    .slice(0, 3)
    .map((x) => `${x.typeName} (−${x.missing}, ${x.branchName})`)
    .join(", ");
  return (
    <Link
      href="/shortages?days=7"
      className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        7 ngày tới thiếu {missing} máy ở {items.length} mã hàng: {names}
        {items.length > 3 ? "…" : ""} — bấm để xem và xử lý →
      </span>
    </Link>
  );
}
