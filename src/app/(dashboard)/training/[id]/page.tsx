import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Circle, PlayCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, TRAINING_MANAGE_ROLES } from "@/lib/roles";
import { VN_TIME_ZONE } from "@/lib/date-format";
import type { TrainingActiveAttempt } from "@/types/database";
import { StartQuizButton } from "../training-buttons";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

// Trang 1 khoá học của người học: danh sách bài (tick bài đã học) + ô thi.
// Thi chỉ mở khi đã học xong mọi bài — luật này RPC training_start_attempt
// chốt lại ở DB, nút ở đây chỉ phản ánh cho dễ hiểu.
export default async function TrainingCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireRole([...ALL_ROLES]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: course }, { data: lessons }, { data: attempts }, { data: active }] = await Promise.all([
    supabase.from("training_courses").select("*").eq("id", id).maybeSingle(),
    supabase.from("training_lessons").select("id, title, video_url, sort_order").eq("course_id", id).order("sort_order").order("created_at"),
    supabase
      .from("training_attempts")
      .select("id, submitted_at, correct_count, total_count, score_percent, passed")
      .eq("course_id", id)
      .eq("employee_id", employee.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }),
    supabase.rpc("training_active_attempt", { p_course_id: id }),
  ]);
  if (!course) notFound();

  const lessonRows = lessons ?? [];
  const { data: completions } = lessonRows.length
    ? await supabase
        .from("training_lesson_completions")
        .select("lesson_id")
        .eq("employee_id", employee.id)
        .in("lesson_id", lessonRows.map((l) => l.id))
    : { data: [] };
  const doneIds = new Set((completions ?? []).map((c) => c.lesson_id));

  const attemptRows = attempts ?? [];
  const activeAttempt = active as TrainingActiveAttempt | null;
  const allLessonsDone = lessonRows.every((l) => doneIds.has(l.id));
  const passed = attemptRows.some((a) => a.passed);
  const attemptsLeft =
    course.max_attempts != null ? Math.max(0, course.max_attempts - attemptRows.length) : null;
  const nextLesson = lessonRows.find((l) => !doneIds.has(l.id));
  const canManage = TRAINING_MANAGE_ROLES.includes(employee.role);

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
            {course.required_roles.includes(employee.role) && <Badge>Bắt buộc</Badge>}
            {!course.is_published && <Badge variant="secondary">Bản nháp</Badge>}
            {passed && (
              <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                <CheckCircle2 className="size-3" />
                Đã đạt
              </Badge>
            )}
          </div>
          {course.description && <p className="text-sm text-muted-foreground">{course.description}</p>}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" render={<Link href={`/training/${course.id}/edit`} />}>
            Soạn khoá học
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Bài học</h2>
            <span className="text-sm text-muted-foreground">
              {lessonRows.filter((l) => doneIds.has(l.id)).length}/{lessonRows.length} đã học
            </span>
          </div>
          <ol className="divide-y">
            {lessonRows.map((lesson, i) => (
              <li key={lesson.id}>
                <Link
                  href={`/training/${course.id}/lessons/${lesson.id}`}
                  className="flex items-center gap-3 py-2.5 text-sm hover:text-primary"
                >
                  {doneIds.has(lesson.id) ? (
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="flex-1">
                    Bài {i + 1}. {lesson.title}
                  </span>
                  {lesson.video_url && <PlayCircle className="size-4 text-muted-foreground" />}
                </Link>
              </li>
            ))}
          </ol>
          {!lessonRows.length && <p className="text-sm text-muted-foreground">Khoá này chưa có bài học.</p>}
          {nextLesson && (
            <Button size="sm" render={<Link href={`/training/${course.id}/lessons/${nextLesson.id}`} />}>
              {doneIds.size ? "Học tiếp" : "Bắt đầu học"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Bài thi trắc nghiệm</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Tối đa {course.questions_per_attempt} câu rút ngẫu nhiên mỗi lần thi — cần đúng từ{" "}
              <span className="font-medium text-foreground">{course.pass_percent}%</span> để đạt.
            </li>
            <li>
              {course.time_limit_minutes
                ? `Thời gian làm bài ${course.time_limit_minutes} phút — hết giờ hệ thống tự nộp.`
                : "Không giới hạn thời gian làm bài."}
            </li>
            <li>
              {attemptsLeft != null
                ? `Được thi tối đa ${course.max_attempts} lần — bạn còn ${attemptsLeft} lần.`
                : "Chưa đạt thì được thi lại, không giới hạn số lần."}
            </li>
          </ul>

          {activeAttempt ? (
            <StartQuizButton courseId={course.id} label="Làm tiếp bài thi đang dở" />
          ) : !allLessonsDone ? (
            <p className="text-sm font-medium text-amber-700">
              Học xong tất cả bài học ở trên để mở bài thi.
            </p>
          ) : attemptsLeft === 0 ? (
            <p className="text-sm font-medium text-destructive">
              Bạn đã hết lượt thi — liên hệ quản lý để được mở lại.
            </p>
          ) : (
            <StartQuizButton courseId={course.id} label={attemptRows.length ? "Thi lại" : "Bắt đầu thi"} />
          )}
        </CardContent>
      </Card>

      {attemptRows.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Lịch sử thi</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời điểm nộp</TableHead>
                  <TableHead className="text-right">Số câu đúng</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attemptRows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">
                      {a.submitted_at ? dateTimeFormatter.format(new Date(a.submitted_at)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.correct_count}/{a.total_count}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{a.score_percent}%</TableCell>
                    <TableCell>
                      {a.passed ? (
                        <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                          Đạt
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Chưa đạt</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/training/${course.id}/attempts/${a.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Xem lại
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
