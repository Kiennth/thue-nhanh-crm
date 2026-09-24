import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { youtubeEmbedUrl } from "@/lib/training";
import { LessonContent } from "../../../lesson-content";
import { CompleteLessonButton } from "../../../training-buttons";

// Trang đọc 1 bài học: video YouTube (nếu có) → nội dung → nút "Đã học xong"
// đưa sang bài kế; bài cuối thì quay về trang khoá để vào thi.
export default async function TrainingLessonPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const employee = await requireRole([...ALL_ROLES]);
  const { id, lessonId } = await params;
  const supabase = await createClient();

  const [{ data: course }, { data: lessons }, { data: lesson }, { data: completion }] = await Promise.all([
    supabase.from("training_courses").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("training_lessons").select("id, title").eq("course_id", id).order("sort_order").order("created_at"),
    supabase.from("training_lessons").select("*").eq("id", lessonId).eq("course_id", id).maybeSingle(),
    supabase
      .from("training_lesson_completions")
      .select("lesson_id")
      .eq("employee_id", employee.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);
  if (!course || !lesson) notFound();

  const order = lessons ?? [];
  const index = order.findIndex((l) => l.id === lesson.id);
  const next = order[index + 1];
  const embedUrl = youtubeEmbedUrl(lesson.video_url);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/training/${course.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {course.title}
      </Link>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Bài {index + 1}/{order.length}
        </p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {lesson.title}
          {completion && <CheckCircle2 className="size-5 text-emerald-600" />}
        </h1>
      </div>

      {embedUrl && (
        <div className="aspect-video overflow-hidden rounded-xl border bg-black">
          <iframe
            src={embedUrl}
            title={lesson.title}
            className="size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      <Card>
        <CardContent>
          <LessonContent doc={lesson.content_json} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <CompleteLessonButton
          lessonId={lesson.id}
          alreadyDone={!!completion}
          nextHref={next ? `/training/${course.id}/lessons/${next.id}` : `/training/${course.id}`}
          nextLabel={next ? "Bài tiếp theo" : "Về khoá học để thi"}
        />
      </div>
    </div>
  );
}
