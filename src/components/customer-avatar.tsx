import { cn } from "@/lib/utils";

const PALETTE_SIZE = 10;

// Băm ổn định theo id khách hàng (không đổi màu khi đổi tên) — chia đều vào
// 10 màu categorical đã kiểm định dùng chung với biểu đồ (--chart-1..10).
function paletteIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % PALETTE_SIZE) + 1;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`.toUpperCase();
}

export function CustomerAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const index = paletteIndex(id);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: `var(--chart-${index})`, color: `var(--chart-${index}-fg)` }}
    >
      {initialsOf(name)}
    </div>
  );
}
