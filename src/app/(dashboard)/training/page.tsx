import Link from "next/link";
import { BookOpen, CheckCircle2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, TRAINING_MANAGE_ROLES } from "@/lib/roles";
import { deleteTrainingCourse } from "@/lib/actions/training";
import { TrainingCourseDialog } from "./course-dialog";

// Đào tạo nội bộ kiểu ASTO (CEO 2026-09-18): nhân viên học bài trong CRM rồi
// thi trắc nghiệm. Trang này là "kệ khoá học" của từng người — RLS tự lọc:
// người học chỉ thấy khoá đã mở, người soạn thấy cả bản nháp.
export default async function TrainingPage() {
  const employee = await requireRole([...ALL_ROLES]);
  const canManage = TRAINING_MANAGE_ROLES.includes(employee.role);
  const supabase = await createClient();

  const [{ data: courses }, { data: lessons }, { data: completions }, { data: attempts }] =
    await Promise.all([
      supabase
        .from("training_courses")
        .select("id, title, description, required_roles, pass_percent, is_published, sort_order")
        .order("sort_order")
        .order("created_at"),
      supabase.from("training_lessons").select("id, course_id"),
      supabase.from("training_lesson_completions").select("lesson_id").eq("employee_id", employee.id),
      supabase
        .from("training_attempts")
        .select("course_id, passed, score_percent")
        .eq("employee_id", employee.id)
        .not("submitted_at", "is", null),
    ]);

  const doneLessonIds = new Set((completions ?? []).map((c) => c.lesson_id));
  const rows = (courses ?? []).map((course) => {
    const courseLessons = (lessons ?? []).filter((l) => l.course_id === course.id);
    const mine = (attempts ?? []).filter((a) => a.course_id === course.id);
    return {
      ...course,
      lessonCount: courseLessons.length,
      doneCount: courseLessons.filter((l) => doneLessonIds.has(l.id)).length,
      attemptCount: mine.length,
      passed: mine.some((a) => a.passed),
      bestScore: mine.length ? Math.max(...mine.map((a) => a.score_percent ?? 0)) : null,
      required: course.required_roles.includes(employee.role),
    };
  });

  const requiredRows = rows.filter((r) => r.required && r.is_published);
  const requiredPassed = requiredRows.filter((r) => r.passed).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Đào tạo</h1>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href="/training/progress" />}>
              <Users className="size-4" />
              Tiến độ nhân viên
            </Button>
            <TrainingCourseDialog />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Khoá bắt buộc đã đạt" value={`${requiredPassed}/${requiredRows.length}`} />
        <StatCard label="Tổng khoá đã đạt" value={rows.filter((r) => r.passed).length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((course) => (
          <Card key={course.id} className="relative">
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {course.required && <Badge>Bắt buộc</Badge>}
                {!course.is_published && <Badge variant="secondary">Bản nháp</Badge>}
                {course.passed ? (
                  <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                    <CheckCircle2 className="size-3" />
                    Đã đạt {course.bestScore}%
                  </Badge>
                ) : course.attemptCount > 0 ? (
                  <Badge variant="destructive">Chưa đạt · cao nhất {course.bestScore}%</Badge>
                ) : null}
              </div>

              <div className="space-y-1">
                <Link
                  href={`/training/${course.id}`}
                  className="font-semibold after:absolute after:inset-0 hover:text-primary"
                >
                  {course.title}
                </Link>
                {course.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
                )}
              </div>

              <div className="mt-auto space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3.5" />
                    {course.doneCount}/{course.lessonCount} bài học
                  </span>
                  <span>Điểm đạt {course.pass_percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${course.lessonCount ? (course.doneCount / course.lessonCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {canManage && (
                // relative z-10: nổi trên lớp link phủ cả thẻ (after:inset-0).
                <div className="relative z-10 flex items-center justify-end gap-1 border-t pt-2">
                  <Button size="sm" variant="ghost" render={<Link href={`/training/${course.id}/edit`} />}>
                    Soạn khoá học
                  </Button>
                  <ConfirmDeleteButton
                    confirmMessage={`Xoá khoá "${course.title}"? Toàn bộ bài học, câu hỏi và KẾT QUẢ THI của nhân viên trong khoá này sẽ mất.`}
                    successMessage="Đã xoá khoá học."
                    action={deleteTrainingCourse}
                    actionArg={course.id}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!rows.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {canManage
            ? "Chưa có khoá học nào — bấm \"Thêm khoá học\" để soạn khoá đầu tiên."
            : "Chưa có khoá học nào được mở."}
        </p>
      )}
    </div>
  );
}
