import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ROLE_LABELS, TRAINING_MANAGE_ROLES } from "@/lib/roles";
import { deleteTrainingLesson, deleteTrainingQuestion } from "@/lib/actions/training";
import { TrainingCourseDialog } from "../../course-dialog";
import { TrainingLessonDialog } from "../../lesson-dialog";
import { TrainingQuestionDialog } from "../../question-dialog";
import { PublishCourseButton } from "../../training-buttons";

// Bàn soạn 1 khoá học (Giám đốc/Admin): cài đặt khoá, bài học, ngân hàng
// câu hỏi. Đây là trang DUY NHẤT hiện cờ đáp án đúng ngoài trang xem lại bài
// đã nộp — RLS training_questions chỉ cho đúng 2 role này đọc.
export default async function TrainingCourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: course }, { data: lessons }, { data: questions }] = await Promise.all([
    supabase.from("training_courses").select("*").eq("id", id).maybeSingle(),
    supabase.from("training_lessons").select("*").eq("course_id", id).order("sort_order").order("created_at"),
    supabase.from("training_questions").select("*").eq("course_id", id).order("created_at"),
  ]);
  if (!course) notFound();

  const lessonRows = lessons ?? [];
  const questionRows = questions ?? [];
  const nextSortOrder = lessonRows.length ? Math.max(...lessonRows.map((l) => l.sort_order)) + 1 : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/training" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Tất cả khoá học
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <Badge variant={course.is_published ? "default" : "secondary"}>
              {course.is_published ? "Đang mở" : "Bản nháp"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Điểm đạt {course.pass_percent}% · {course.questions_per_attempt} câu/lần thi ·{" "}
            {course.time_limit_minutes ? `${course.time_limit_minutes} phút` : "không giới hạn giờ"} ·{" "}
            {course.max_attempts ? `tối đa ${course.max_attempts} lần thi` : "thi lại thoải mái"}
          </p>
          <p className="text-sm text-muted-foreground">
            Bắt buộc với:{" "}
            {course.required_roles.length
              ? course.required_roles.map((r) => ROLE_LABELS[r]).join(", ")
              : "không ai (tự nguyện)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" render={<Link href={`/training/${course.id}`} />}>
            Xem như người học
          </Button>
          <TrainingCourseDialog course={course} />
          <PublishCourseButton courseId={course.id} isPublished={course.is_published} />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Bài học ({lessonRows.length})</h2>
            <TrainingLessonDialog courseId={course.id} nextSortOrder={nextSortOrder} />
          </div>
          <ul className="divide-y">
            {lessonRows.map((lesson, i) => (
              <li key={lesson.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{lesson.title}</span>
                {lesson.video_url && <PlayCircle className="size-4 text-muted-foreground" />}
                <TrainingLessonDialog courseId={course.id} lesson={lesson} />
                <ConfirmDeleteButton
                  confirmMessage={`Xoá bài học "${lesson.title}"?`}
                  successMessage="Đã xoá bài học."
                  action={deleteTrainingLesson}
                  actionArg={lesson.id}
                />
              </li>
            ))}
          </ul>
          {!lessonRows.length && (
            <p className="text-sm text-muted-foreground">
              Chưa có bài học. Khoá không có bài học thì nhân viên vào thi thẳng.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Ngân hàng câu hỏi ({questionRows.length})</h2>
            <TrainingQuestionDialog courseId={course.id} />
          </div>

          {questionRows.length < course.questions_per_attempt && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Ngân hàng mới có {questionRows.length} câu, ít hơn {course.questions_per_attempt} câu/lần thi —
                lần thi nào cũng ra đúng bấy nhiêu câu. Nên soạn gấp 2-3 lần số câu mỗi lần thi để đề thi lại
                khác đề cũ.
              </span>
            </p>
          )}

          <ol className="divide-y">
            {questionRows.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-medium">{q.question_text}</p>
                  <ul className="space-y-0.5">
                    {q.options.map((o) => (
                      <li
                        key={o.id}
                        className={`flex items-center gap-1.5 ${
                          o.correct ? "font-medium text-emerald-700" : "text-muted-foreground"
                        }`}
                      >
                        {o.correct ? <Check className="size-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="text-xs text-muted-foreground">Giải thích: {q.explanation}</p>}
                </div>
                <TrainingQuestionDialog courseId={course.id} question={q} />
                <ConfirmDeleteButton
                  confirmMessage="Xoá câu hỏi này? Các bài thi đã nộp vẫn giữ nguyên đề cũ."
                  successMessage="Đã xoá câu hỏi."
                  action={deleteTrainingQuestion}
                  actionArg={q.id}
                />
              </li>
            ))}
          </ol>
          {!questionRows.length && (
            <p className="text-sm text-muted-foreground">Chưa có câu hỏi — cần ít nhất 1 câu mới mở được khoá.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
