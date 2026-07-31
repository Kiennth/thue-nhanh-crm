import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export interface ExpenseRow {
  id: string;
  branch_id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  note: string | null;
  created_by: string | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  sort_order: number;
}

// Kỳ đang xem + kỳ liền trước (để tính % biến động) + 12 tháng gần nhất (cho
// xu hướng) — gói trong 1 lần gọi để trang chỉ chờ một lượt.
export interface ExpenseData {
  categories: ExpenseCategory[];
  periodRows: ExpenseRow[];
  previousPeriodRows: ExpenseRow[];
  trendRows: ExpenseRow[];
}

export type ExpensePeriod = "month" | "quarter" | "year";

export function expensePeriodRange(
  period: ExpensePeriod,
  anchor: string, // "YYYY-MM"
): { start: string; end: string; prevStart: string; prevEnd: string; label: string } {
  const [y, m] = anchor.split("-").map(Number);
  const fmt = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const shift = (yy: number, mm: number, delta: number) => {
    const d = new Date(yy, mm - 1 + delta, 1);
    return [d.getFullYear(), d.getMonth() + 1] as const;
  };

  if (period === "month") {
    const [ny, nm] = shift(y, m, 1);
    const [py, pm] = shift(y, m, -1);
    return {
      start: fmt(y, m),
      end: fmt(ny, nm),
      prevStart: fmt(py, pm),
      prevEnd: fmt(y, m),
      label: `tháng ${String(m).padStart(2, "0")}/${y}`,
    };
  }
  if (period === "quarter") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const [ny, nm] = shift(y, qStartMonth, 3);
    const [py, pm] = shift(y, qStartMonth, -3);
    return {
      start: fmt(y, qStartMonth),
      end: fmt(ny, nm),
      prevStart: fmt(py, pm),
      prevEnd: fmt(y, qStartMonth),
      label: `quý ${Math.floor((m - 1) / 3) + 1}/${y}`,
    };
  }
  return {
    start: fmt(y, 1),
    end: fmt(y + 1, 1),
    prevStart: fmt(y - 1, 1),
    prevEnd: fmt(y, 1),
    label: `năm ${y}`,
  };
}

const EXPENSE_COLUMNS = "id, branch_id, category_id, amount, expense_date, note, created_by";

export async function fetchExpenseData(
  period: ExpensePeriod,
  anchor: string,
): Promise<ExpenseData & { range: ReturnType<typeof expensePeriodRange> }> {
  const supabase = await createClient();
  const range = expensePeriodRange(period, anchor);

  // Mốc đầu cho đường xu hướng: 12 tháng lùi từ tháng neo.
  const [y, m] = anchor.split("-").map(Number);
  const trendStart = new Date(y, m - 12, 1);
  const trendStartStr = `${trendStart.getFullYear()}-${String(trendStart.getMonth() + 1).padStart(2, "0")}-01`;

  const [categories, periodRows, previousPeriodRows, trendRows] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then((r) => r.data ?? []),
    fetchAllRows<ExpenseRow>((from, to) =>
      supabase
        .from("expenses")
        .select(EXPENSE_COLUMNS)
        .gte("expense_date", range.start)
        .lt("expense_date", range.end)
        .order("expense_date", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<ExpenseRow>((from, to) =>
      supabase
        .from("expenses")
        .select(EXPENSE_COLUMNS)
        .gte("expense_date", range.prevStart)
        .lt("expense_date", range.prevEnd)
        .range(from, to),
    ),
    fetchAllRows<ExpenseRow>((from, to) =>
      supabase
        .from("expenses")
        .select(EXPENSE_COLUMNS)
        .gte("expense_date", trendStartStr)
        .lt("expense_date", range.end)
        .range(from, to),
    ),
  ]);

  return { categories, periodRows, previousPeriodRows, trendRows, range };
}

export function sumAmount(rows: { amount: number }[]): number {
  return rows.reduce((sum, r) => sum + Number(r.amount), 0);
}
