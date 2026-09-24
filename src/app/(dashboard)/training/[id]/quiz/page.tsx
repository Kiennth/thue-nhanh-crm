import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import type { TrainingActiveAttempt } from "@/types/database";
import { QuizForm } from "./quiz-form";

// Trang làm bài. KHÔNG tự mở bài thi ở đây (render GET không được ghi dữ
// liệu, lại còn tốn lượt thi khi ai đó lỡ mở link) — bài thi do nút "Bắt
// đầu thi" mở qua action; trang này chỉ đọc đề đã bóc đáp án qua RPC.
export default async function TrainingQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...ALL_ROLES]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: course }, { data: active }] = await Promise.all([
    supabase.from("training_courses").select("id, title").eq("id", id).maybeSingle(),
    supabase.rpc("training_active_attempt", { p_course_id: id }),
  ]);
  if (!course) notFound();

  const attempt = active as TrainingActiveAttempt | null;
  if (!attempt) redirect(`/training/${id}`);

  return <QuizForm courseId={course.id} courseTitle={course.title} attempt={attempt} />;
}
