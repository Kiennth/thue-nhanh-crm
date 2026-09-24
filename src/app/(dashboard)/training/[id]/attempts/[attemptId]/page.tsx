import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { VN_TIME_ZONE } from "@/lib/date-format";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

// Kết quả + xem lại 1 lần thi đã nộp. RLS: người học chỉ mở được bài ĐÃ NỘP
// của chính mình (bài đang dở không đọc được vì snapshot có đáp án); người
// soạn mở được bài của mọi người từ trang Tiến độ.
export default async function TrainingAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const viewer = await requireRole([...ALL_ROLES]);
  const { id, attemptId } = await params;
  const supabase = await createClient();

  const [{ data: course }, { data: attempt }] = await Promise.all([
    supabase.from("training_courses").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("training_attempts").select("*").eq("id", attemptId).eq("course_id", id).maybeSingle(),
  ]);
  if (!course || !attempt) notFound();

  const isOwn = attempt.employee_id === viewer.id;
  const { data: owner } = isOwn
    ? { data: null }
    : await supabase.from("employees_public").select("name").eq("id", attempt.employee_id).maybeSingle();

  if (!attempt.submitted_at) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {owner?.name ?? "Nhân viên"} đang làm dở bài thi này — chưa có kết quả.
        </p>
      </div>
    );
  }

  const answers = attempt.answers ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={isOwn ? `/training/${course.id}` : "/training/progress"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {isOwn ? course.title : "Tiến độ nhân viên"}
      </Link>

      <Card className={attempt.passed ? "border-emerald-600/40" : "border-destructive/40"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {owner ? `${owner.name} · ` : ""}
              {course.title} · nộp lúc {dateTimeFormatter.format(new Date(attempt.submitted_at))}
            </p>
            <p className="flex items-center gap-2 text-2xl font-semibold">
              {attempt.passed ? (
                <>
                  <PartyPopper className="size-6 text-emerald-600" />
                  <span className="text-emerald-700">Đạt</span>
                </>
              ) : (
                <span className="text-destructive">Chưa đạt</span>
              )}
              <span className="tabular-nums">{attempt.score_percent}%</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Đúng {attempt.correct_count}/{attempt.total_count} câu · điểm đạt {attempt.pass_percent}%
            </p>
          </div>
          {isOwn && !attempt.passed && (
            <Button render={<Link href={`/training/${course.id}`} />}>Ôn lại và thi lại</Button>
          )}
        </CardContent>
      </Card>

      {attempt.snapshot.map((q, i) => {
        const picked = new Set(answers[q.id] ?? []);
        const correctIds = q.options.filter((o) => o.correct).map((o) => o.id);
        const isRight = picked.size === correctIds.length && correctIds.every((x) => picked.has(x));
        return (
          <Card key={q.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
                    isRight ? "bg-emerald-600" : "bg-destructive"
                  }`}
                >
                  {isRight ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </span>
                <p className="font-medium">
                  <span className="text-muted-foreground">Câu {i + 1}.</span> {q.text}
                </p>
              </div>
              <ul className="space-y-1.5">
                {q.options.map((o) => {
                  const wasPicked = picked.has(o.id);
                  return (
                    <li
                      key={o.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                        o.correct
                          ? "border-emerald-600/40 bg-emerald-50"
                          : wasPicked
                            ? "border-destructive/40 bg-destructive/5"
                            : ""
                      }`}
                    >
                      <span>{o.text}</span>
                      <span className="shrink-0 text-xs font-medium">
                        {o.correct && <span className="text-emerald-700">Đáp án đúng</span>}
                        {o.correct && wasPicked && <span className="text-muted-foreground"> · </span>}
                        {wasPicked && (
                          <span className={o.correct ? "text-emerald-700" : "text-destructive"}>Đã chọn</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {picked.size === 0 && <p className="text-xs text-muted-foreground">Bỏ trống câu này.</p>}
              {q.explanation && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="font-medium">Giải thích: </span>
                  {q.explanation}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
