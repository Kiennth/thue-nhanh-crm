"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EXPENSE_ROLES } from "@/lib/roles";
import { coveredPairsInMonth } from "@/lib/recurring-expenses";

export type ActionState = { error: string } | { success: true } | undefined;

const ExpenseSchema = z.object({
  branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh." }),
  category_id: z.string().uuid({ message: "Vui lòng chọn hạng mục." }),
  amount: z.coerce.number().positive({ message: "Số tiền phải lớn hơn 0." }),
  expense_date: z.string().min(1, { message: "Vui lòng chọn ngày." }),
  note: z.string().trim().optional(),
});

// Cửa hàng trưởng chỉ được thao tác trên kho mình — RLS đã chặn ở tầng
// Postgres, nhưng chặn thêm ở đây để trả lỗi tiếng Việt tử tế thay vì lỗi
// "row-level security" khô khan của Supabase.
async function requireExpenseAccess(branchId: string) {
  const employee = await requireRole([...EXPENSE_ROLES]);
  if (employee.role === "cua_hang_truong" && employee.branch_id !== branchId) {
    return { employee, error: "Cửa hàng trưởng chỉ nhập được chi phí của kho mình." };
  }
  return { employee, error: null };
}

export async function createExpense(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = ExpenseSchema.safeParse({
    branch_id: formData.get("branch_id"),
    category_id: formData.get("category_id"),
    amount: formData.get("amount"),
    expense_date: formData.get("expense_date"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { employee, error: accessError } = await requireExpenseAccess(parsed.data.branch_id);
  if (accessError) return { error: accessError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .insert({ ...parsed.data, created_by: employee.id });
  if (error) {
    return { error: "Không thể ghi khoản chi: " + error.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function updateExpense(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = ExpenseSchema.safeParse({
    branch_id: formData.get("branch_id"),
    category_id: formData.get("category_id"),
    amount: formData.get("amount"),
    expense_date: formData.get("expense_date"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { error: accessError } = await requireExpenseAccess(parsed.data.branch_id);
  if (accessError) return { error: accessError };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update(parsed.data).eq("id", id);
  if (error) {
    return { error: "Không thể sửa khoản chi: " + error.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

// Trả void theo đúng chữ ký ConfirmDeleteButton dùng chung; lỗi ném ra để
// nút hiển thị thông báo thất bại.
export async function deleteExpense(id: string): Promise<void> {
  await requireRole([...EXPENSE_ROLES]);

  // RLS lo phần "cửa hàng trưởng chỉ xoá được khoản của kho mình" — nếu
  // không khớp, delete im lặng 0 dòng, nên kiểm tra đếm để báo đúng sự thật.
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("expenses")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    throw new Error("Không thể xoá khoản chi: " + error.message);
  }
  if (!count) {
    throw new Error("Không tìm thấy khoản chi (hoặc bạn không có quyền xoá khoản này).");
  }

  revalidatePath("/expenses");
}

const RecurringExpenseSchema = z
  .object({
    branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh." }),
    category_id: z.string().uuid({ message: "Vui lòng chọn hạng mục." }),
    amount: z.coerce.number().positive({ message: "Số tiền phải lớn hơn 0." }),
    frequency: z.enum(["monthly", "quarterly", "yearly"]),
    start_date: z.string().min(1, { message: "Vui lòng chọn ngày bắt đầu." }),
    end_date: z.string().optional(),
    note: z.string().trim().optional(),
  })
  .refine((d) => !d.end_date || d.end_date >= d.start_date, {
    message: "Ngày kết thúc phải sau ngày bắt đầu.",
    path: ["end_date"],
  });

function parseRecurringForm(formData: FormData) {
  return RecurringExpenseSchema.safeParse({
    branch_id: formData.get("branch_id"),
    category_id: formData.get("category_id"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date") || undefined,
    note: formData.get("note") || undefined,
  });
}

export async function createRecurringExpense(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseRecurringForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  const { employee, error: accessError } = await requireExpenseAccess(parsed.data.branch_id);
  if (accessError) return { error: accessError };

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_expenses").insert({
    ...parsed.data,
    end_date: parsed.data.end_date ?? null,
    created_by: employee.id,
  });
  if (error) {
    return { error: "Không thể tạo chi phí định kỳ: " + error.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function updateRecurringExpense(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseRecurringForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  const { error: accessError } = await requireExpenseAccess(parsed.data.branch_id);
  if (accessError) return { error: accessError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_expenses")
    .update({ ...parsed.data, end_date: parsed.data.end_date ?? null })
    .eq("id", id);
  if (error) {
    return { error: "Không thể sửa chi phí định kỳ: " + error.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  await requireRole([...EXPENSE_ROLES]);

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("recurring_expenses")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    throw new Error("Không thể xoá chi phí định kỳ: " + error.message);
  }
  if (!count) {
    throw new Error("Không tìm thấy chi phí định kỳ (hoặc bạn không có quyền xoá).");
  }

  revalidatePath("/expenses");
}

// "Chép từ tháng trước": đổ lại toàn bộ khoản chi tháng trước vào tháng này
// (giữ chi nhánh/hạng mục/số tiền/ghi chú, dời ngày sang tháng này) để kế
// toán chỉ phải sửa lại con số điện nước. Cố tình KHÔNG làm khoản lặp tự
// động — thứ chạy ngầm hàng tháng luôn đẻ ra rắc rối khi nghỉ kho/đổi giá.
export async function copyExpensesFromPreviousMonth(month: string): Promise<ActionState> {
  const employee = await requireRole([...EXPENSE_ROLES]);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: "Tháng không hợp lệ." };
  }
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prevStart = `${prev}-01`;
  const prevEnd = `${month}-01`;

  const supabase = await createClient();
  let q = supabase
    .from("expenses")
    .select("branch_id, category_id, amount, expense_date, note")
    .gte("expense_date", prevStart)
    .lt("expense_date", prevEnd);
  // RLS đã lọc sẵn theo kho cho cửa hàng trưởng, nhưng lọc tường minh cho rõ.
  if (employee.role === "cua_hang_truong" && employee.branch_id) {
    q = q.eq("branch_id", employee.branch_id);
  }
  const { data: prevRows, error: readError } = await q;
  if (readError) {
    return { error: "Không đọc được chi phí tháng trước: " + readError.message };
  }

  // Bỏ qua các cặp (chi nhánh, hạng mục) đã có ĐỊNH KỲ hoạt động trong tháng
  // đích — nếu không sẽ vừa tự ghi vừa chép tay ra 2 dòng tiền nhà.
  const { data: recurringDefs } = await supabase
    .from("recurring_expenses")
    .select("id, branch_id, category_id, amount, frequency, start_date, end_date, note");
  const covered = coveredPairsInMonth(recurringDefs ?? [], month);
  const copyable = (prevRows ?? []).filter(
    (r) => !covered.has(`${r.branch_id}:${r.category_id}`),
  );
  const skipped = (prevRows?.length ?? 0) - copyable.length;

  if (!copyable.length) {
    return {
      error: skipped
        ? `Tháng ${prev} chỉ có các khoản đã nằm trong chi phí định kỳ — không có gì để chép.`
        : `Tháng ${prev} chưa có khoản chi nào để chép.`,
    };
  }
  const prevRowsToUse = copyable;

  // Đã có dòng trong tháng này thì không chép đè — tránh bấm 2 lần ra 2 bộ.
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const { count: existing } = await supabase
    .from("expenses")
    .select("*", { count: "exact", head: true })
    .gte("expense_date", `${month}-01`)
    .lt("expense_date", `${nextMonth}-01`);
  if (existing) {
    return { error: `Tháng ${month} đã có ${existing} khoản chi — chép nữa sẽ bị trùng.` };
  }

  const inserts = prevRowsToUse.map((r) => ({
    branch_id: r.branch_id,
    category_id: r.category_id,
    amount: r.amount,
    // Giữ đúng NGÀY trong tháng (thuê nhà mùng 5 vẫn là mùng 5), chỉ đổi
    // năm-tháng; ngày 29-31 rơi vào tháng ngắn thì lùi về ngày cuối tháng.
    expense_date: shiftToMonth(r.expense_date, month),
    note: r.note,
    created_by: employee.id,
  }));

  const { error: insertError } = await supabase.from("expenses").insert(inserts);
  if (insertError) {
    return { error: "Không thể chép: " + insertError.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

function shiftToMonth(dateStr: string, month: string): string {
  const day = Number(dateStr.slice(8, 10));
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
