import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Màu nhận diện cho từng khối (Card) — viền nóc đậm, đầu khối nhuộm nhạt,
// icon trong ô màu; `hex` (sắc 500) dùng cho style inline như thanh biểu đồ. Class Tailwind viết tĩnh (không dựng chuỗi động) để JIT
// không bỏ sót; biến thể dark tự đổi độ đậm chữ.
const ACCENTS = {
  indigo: {
    hex: "#6366f1",
    card: "border-t-4 border-t-indigo-500",
    header: "bg-indigo-500/5",
    chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  sky: {
    hex: "#0ea5e9",
    card: "border-t-4 border-t-sky-500",
    header: "bg-sky-500/5",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  blue: {
    hex: "#3b82f6",
    card: "border-t-4 border-t-blue-500",
    header: "bg-blue-500/5",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  violet: {
    hex: "#8b5cf6",
    card: "border-t-4 border-t-violet-500",
    header: "bg-violet-500/5",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  amber: {
    hex: "#f59e0b",
    card: "border-t-4 border-t-amber-500",
    header: "bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  orange: {
    hex: "#f97316",
    card: "border-t-4 border-t-orange-500",
    header: "bg-orange-500/5",
    chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  emerald: {
    hex: "#10b981",
    card: "border-t-4 border-t-emerald-500",
    header: "bg-emerald-500/5",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  rose: {
    hex: "#f43f5e",
    card: "border-t-4 border-t-rose-500",
    header: "bg-rose-500/5",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
} as const;

export type SectionAccent = keyof typeof ACCENTS;

// Mã màu sắc 500 — cho thanh RevenueBarList/đường biểu đồ (style inline).
export function accentColor(accent: SectionAccent) {
  return ACCENTS[accent].hex;
}

// className cho <Card> — pt-0 để phần đầu nhuộm màu sát viền nóc.
export function accentCard(accent: SectionAccent, className?: string) {
  return cn("overflow-hidden pt-0", ACCENTS[accent].card, className);
}

// className cho <CardHeader>.
export function accentHeader(accent: SectionAccent, className?: string) {
  return cn("border-b py-3", ACCENTS[accent].header, className);
}

// Nội dung <CardTitle>: icon trong ô màu + chữ.
export function AccentTitle({
  accent,
  icon: Icon,
  children,
}: {
  accent: SectionAccent;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", ACCENTS[accent].chip)}>
        <Icon className="size-4" />
      </span>
      {children}
    </span>
  );
}
