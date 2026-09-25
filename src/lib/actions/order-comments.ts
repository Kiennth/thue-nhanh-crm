"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, DIRECTOR_ONLY } from "@/lib/roles";

export type ActionState = { error: string } | { success: true } | undefined;

const CommentSchema = z.object({
  order_id: z.string().uuid(),
  parent_id: z.string().uuid().optional(),
  body: z
    .string()
    .trim()
    .min(1, { message: "Vui lòng nhập nội dung." })
    .max(4000, { message: "Tối đa 4.000 ký tự." }),
});

// Bình luận nội bộ trên đơn (CEO 2026-09-25) — chỉ ghi thêm, không sửa, để
// giữ nguyên lịch sử trao đổi. Trả lời luôn gắn vào bình luận gốc (1 tầng).
export async function addOrderComment(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);

  const parsed = CommentSchema.safeParse({
    order_id: formData.get("order_id"),
    parent_id: formData.get("parent_id") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  let parentId = parsed.data.parent_id ?? null;
  if (parentId) {
    const { data: parent } = await supabase
      .from("order_comments")
      .select("id, parent_id, order_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.order_id !== parsed.data.order_id) {
      return { error: "Bình luận gốc không còn tồn tại." };
    }
    parentId = parent.parent_id ?? parent.id;
  }

  const { error } = await supabase.from("order_comments").insert({
    order_id: parsed.data.order_id,
    parent_id: parentId,
    employee_id: employee.id,
    body: parsed.data.body,
  });
  if (error) {
    return { error: "Không đăng được bình luận: " + error.message };
  }

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { success: true };
}

export async function deleteOrderComment(id: string) {
  await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const { data: comment } = await supabase
    .from("order_comments")
    .select("order_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("order_comments").delete().eq("id", id);
  if (error) {
    throw new Error("Không xoá được bình luận: " + error.message);
  }
  if (comment) revalidatePath(`/orders/${comment.order_id}`);
}
