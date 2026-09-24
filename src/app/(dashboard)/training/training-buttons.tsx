"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  completeTrainingLesson,
  startTrainingAttempt,
  toggleTrainingCoursePublished,
} from "@/lib/actions/training";

// Mở/ẩn khoá học với nhân viên — khoá chưa có câu hỏi thì server từ chối mở.
export function PublishCourseButton({ courseId, isPublished }: { courseId: string; isPublished: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={isPublished ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleTrainingCoursePublished(courseId);
          if (result && "error" in result) toast.error(result.error);
          else toast.success(isPublished ? "Đã ẩn khoá học." : "Đã mở khoá học cho nhân viên.");
        })
      }
    >
      {isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      {isPublished ? "Ẩn khoá học" : "Mở cho nhân viên học"}
    </Button>
  );
}

// "Bắt đầu thi" / "Làm tiếp bài thi" — server mở bài rồi tự chuyển trang.
export function StartQuizButton({
  courseId,
  label,
  disabled,
}: {
  courseId: string;
  label: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startTrainingAttempt(courseId);
            if (result && "error" in result) setError(result.error);
          });
        }}
      >
        <PlayCircle className="size-4" />
        {pending ? "Đang mở bài thi..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// Đánh dấu đã học xong rồi đi tiếp (bài kế, hoặc về trang khoá để thi).
export function CompleteLessonButton({
  lessonId,
  nextHref,
  nextLabel,
  alreadyDone,
}: {
  lessonId: string;
  nextHref: string;
  nextLabel: string;
  alreadyDone: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!alreadyDone) {
            const result = await completeTrainingLesson(lessonId);
            if (result && "error" in result) {
              toast.error(result.error);
              return;
            }
          }
          router.push(nextHref);
        })
      }
    >
      <CheckCircle2 className="size-4" />
      {pending ? "Đang lưu..." : alreadyDone ? nextLabel : `Đã học xong — ${nextLabel}`}
    </Button>
  );
}
