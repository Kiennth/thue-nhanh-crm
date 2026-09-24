"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertTrainingLesson } from "@/lib/actions/training";
import type { Database } from "@/types/database";
import { LessonEditor } from "./lesson-editor";

type LessonRow = Database["public"]["Tables"]["training_lessons"]["Row"];

// Không có lesson = nút "Thêm bài học"; có = nút bút chì sửa bài.
// nextSortOrder: thứ tự gợi ý cho bài mới (nối đuôi danh sách).
export function TrainingLessonDialog({
  courseId,
  lesson,
  nextSortOrder = 0,
}: {
  courseId: string;
  lesson?: LessonRow;
  nextSortOrder?: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertTrainingLesson(courseId, lesson?.id ?? null, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          lesson ? (
            <Button variant="ghost" size="icon-sm">
              <Pencil className="size-4" />
              <span className="sr-only">Sửa bài học</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Thêm bài học
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{lesson ? `Sửa bài học: ${lesson.title}` : "Thêm bài học"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor="lesson_title">Tên bài học</Label>
              <Input id="lesson_title" name="title" defaultValue={lesson?.title} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lesson_sort_order">Thứ tự</Label>
              <Input
                id="lesson_sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={lesson?.sort_order ?? nextSortOrder}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lesson_video_url">Video YouTube (không bắt buộc)</Label>
            <Input
              id="lesson_video_url"
              name="video_url"
              type="url"
              defaultValue={lesson?.video_url ?? ""}
              placeholder="https://youtu.be/..."
            />
            <p className="text-xs text-muted-foreground">
              Video nội bộ nên đăng YouTube ở chế độ &quot;Không công khai&quot; rồi dán link vào đây.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nội dung</Label>
            {/* Mount theo open để mỗi lần mở lại là bản mới nhất từ server */}
            {open && <LessonEditor name="content_json" defaultValue={lesson?.content_json} />}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu bài học"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
