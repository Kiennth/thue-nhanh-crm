import type { RecurringFrequency } from "@/types/database";

// Chi phí định kỳ KHÔNG materialize thành dòng expenses: mỗi lần đọc, các
// định nghĩa được "trải" ra thành dòng ảo cho từng kỳ nó rơi vào. Sửa định
// nghĩa là sửa mọi tháng, đặt end_date là tự ngừng — không có job ngầm.

export interface RecurringExpenseDef {
  id: string;
  branch_id: string;
  category_id: string;
  amount: number;
  frequency: RecurringFrequency;
  start_date: string; // ngày bắt đầu, đồng thời ấn định NGÀY GHI mỗi kỳ
  end_date: string | null;
  note: string | null;
}

export interface ExpandedRecurringRow {
  // id tổng hợp — đủ ổn định để làm key React, KHÔNG phải id trong CSDL.
  id: string;
  recurringId: string;
  branch_id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  note: string | null;
}

const FREQUENCY_MONTHS: Record<RecurringFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  yearly: "Hàng năm",
};

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

// Định nghĩa có rơi vào tháng "YYYY-MM" không? Nếu có, trả về ngày ghi trong
// tháng đó (giữ ngày của start_date; 29-31 rơi vào tháng ngắn thì lùi về
// ngày cuối tháng — giống logic "Chép từ tháng trước").
export function occurrenceInMonth(def: RecurringExpenseDef, ym: string): string | null {
  const startYm = def.start_date.slice(0, 7);
  const diff = monthIndex(ym) - monthIndex(startYm);
  if (diff < 0 || diff % FREQUENCY_MONTHS[def.frequency] !== 0) return null;

  const day = Number(def.start_date.slice(8, 10));
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const date = `${ym}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;

  // Kỳ đầu tiên chính là start_date; các kỳ sau phải chưa vượt end_date.
  if (date < def.start_date) return null;
  if (def.end_date !== null && date > def.end_date) return null;
  return date;
}

export function monthsBetween(startInclusive: string, endExclusive: string): string[] {
  const months: string[] = [];
  let i = monthIndex(startInclusive.slice(0, 7));
  const end = monthIndex(endExclusive.slice(0, 7));
  for (; i < end; i++) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

export function expandRecurring(
  defs: RecurringExpenseDef[],
  months: string[],
): ExpandedRecurringRow[] {
  const rows: ExpandedRecurringRow[] = [];
  for (const def of defs) {
    for (const ym of months) {
      const date = occurrenceInMonth(def, ym);
      if (!date) continue;
      rows.push({
        id: `rec-${def.id}-${ym}`,
        recurringId: def.id,
        branch_id: def.branch_id,
        category_id: def.category_id,
        amount: Number(def.amount),
        expense_date: date,
        note: def.note,
      });
    }
  }
  return rows;
}

// Cặp (chi nhánh, hạng mục) đã có định kỳ hoạt động trong tháng — dùng để
// nút "Chép từ tháng trước" bỏ qua, tránh vừa chép tay vừa tự ghi ra 2 dòng
// tiền nhà.
export function coveredPairsInMonth(defs: RecurringExpenseDef[], ym: string): Set<string> {
  const covered = new Set<string>();
  for (const def of defs) {
    if (occurrenceInMonth(def, ym)) covered.add(`${def.branch_id}:${def.category_id}`);
  }
  return covered;
}
