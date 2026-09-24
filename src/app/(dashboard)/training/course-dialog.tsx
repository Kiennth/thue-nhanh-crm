"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { upsertTrainingCourse } from "@/lib/actions/training";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/roles";
import type { Database } from "@/types/database";

type CourseRow = Database["public"]["Tables"]["training_courses"]["Row"];

// Không có course = nút "Thêm khoá học" (tạo xong nhảy thẳng sang trang
// soạn bài); có = nút "Cài đặt khoá" trong trang soạn.
export function TrainingCourseDialog({ course }: { course?: CourseRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertTrainingCourse(course?.id ?? null, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!course && result?.id) router.push(`/training/${result.id}/edit`);
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
          course ? (
            <Button size="sm" variant="outline">
              <Settings2 className="size-4" />
              Cài đặt khoá
            </Button>
          ) : (
            <Button size="sm">
              <Plus className="size-4" />
              Thêm khoá học
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{course ? "Cài đặt khoá học" : "Thêm khoá học"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="title">Tên khoá học</Label>
            <Input
              id="title"
              name="title"
              defaultValue={course?.title}
              placeholder="VD: Quy trình giao máy cho khách"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Mô tả ngắn</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={course?.description ?? ""}
              placeholder="Học xong khoá này nhân viên làm được gì?"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Bắt buộc với vị trí</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ALL_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="required_roles"
                    value={role}
                    defaultChecked={course?.required_roles.includes(role)}
                    className="size-4"
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Không chọn = khoá tự nguyện. Ai cũng học được mọi khoá đã mở.
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pass_percent">Điểm đạt (%)</Label>
              <Input
                id="pass_percent"
                name="pass_percent"
                type="number"
                min={1}
                max={100}
                defaultValue={course?.pass_percent ?? 80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="questions_per_attempt">Số câu mỗi lần thi</Label>
              <Input
                id="questions_per_attempt"
                name="questions_per_attempt"
                type="number"
                min={1}
                max={100}
                defaultValue={course?.questions_per_attempt ?? 10}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time_limit_minutes">Thời gian làm bài (phút)</Label>
              <Input
                id="time_limit_minutes"
                name="time_limit_minutes"
                type="number"
                min={1}
                max={600}
                defaultValue={course?.time_limit_minutes ?? ""}
                placeholder="Trống = không giới hạn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_attempts">Số lần thi tối đa</Label>
              <Input
                id="max_attempts"
                name="max_attempts"
                type="number"
                min={1}
                max={100}
                defaultValue={course?.max_attempts ?? ""}
                placeholder="Trống = thi lại thoải mái"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Mỗi lần thi rút ngẫu nhiên số câu trên từ ngân hàng câu hỏi và đảo thứ tự đáp án.
          </p>

          <div className="space-y-2">
            <Label htmlFor="sort_order">Thứ tự hiển thị</Label>
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={course?.sort_order ?? 0} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : course ? "Lưu" : "Tạo và soạn bài"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
