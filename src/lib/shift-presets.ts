// Mẫu ca trực (CEO 2026-10-05) — dùng ở cả server (lịch iCal) lẫn client
// (hộp chọn ca). Giờ sửa được từng ca khi xếp.
export type ShiftKind = "work" | "leave" | "off";

export interface ShiftPreset {
  label: string;
  kind: ShiftKind;
  start: string | null; // "HH:MM"
  end: string | null;
  // Màu hiển thị trong bảng lịch.
  className: string;
}

export const SHIFT_PRESETS: ShiftPreset[] = [
  { label: "Hành chính", kind: "work", start: "08:30", end: "17:30", className: "bg-sky-500/15 text-sky-800 ring-sky-500/30 dark:text-sky-200" },
  { label: "Ca sáng", kind: "work", start: "08:00", end: "12:00", className: "bg-amber-400/20 text-amber-900 ring-amber-500/30 dark:text-amber-200" },
  { label: "Ca chiều", kind: "work", start: "13:30", end: "17:30", className: "bg-orange-500/15 text-orange-800 ring-orange-500/30 dark:text-orange-200" },
  { label: "Ca tối", kind: "work", start: "18:00", end: "22:00", className: "bg-violet-500/15 text-violet-800 ring-violet-500/30 dark:text-violet-200" },
  { label: "Trực sự kiện", kind: "work", start: "06:00", end: "22:00", className: "bg-fuchsia-500/15 text-fuchsia-800 ring-fuchsia-500/30 dark:text-fuchsia-200" },
  { label: "Nghỉ phép", kind: "leave", start: null, end: null, className: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200" },
  { label: "Nghỉ", kind: "off", start: null, end: null, className: "bg-muted text-muted-foreground ring-border" },
];

export function shiftClass(label: string, kind: ShiftKind): string {
  return (
    SHIFT_PRESETS.find((p) => p.label === label)?.className ??
    (kind === "work" ? SHIFT_PRESETS[0].className : SHIFT_PRESETS[SHIFT_PRESETS.length - 1].className)
  );
}

// Việc được giao lấy từ dòng đơn có gắn người làm.
export type JobKind = "delivery" | "collection" | "installation" | "removal" | "support";

export const JOB_LABELS: Record<JobKind, string> = {
  delivery: "Giao",
  collection: "Thu hồi",
  installation: "Lắp đặt",
  removal: "Tháo dỡ",
  support: "Hỗ trợ KT",
};

export const JOB_ICONS: Record<JobKind, string> = {
  delivery: "🚚",
  collection: "↩️",
  installation: "🔧",
  removal: "📦",
  support: "🛠️",
};
