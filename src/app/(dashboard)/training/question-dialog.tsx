"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
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
import { upsertTrainingQuestion } from "@/lib/actions/training";
import type { Database } from "@/types/database";

type QuestionRow = Database["public"]["Tables"]["training_questions"]["Row"];
type DraftOption = { key: number; text: string; correct: boolean };

const MAX_OPTIONS = 6;
const blankOptions = (): DraftOption[] => [0, 1, 2, 3].map((key) => ({ key, text: "", correct: false }));

// Soạn 1 câu trắc nghiệm: 2-6 đáp án, tick đáp án đúng. Tick nhiều hơn 1 =
// câu "chọn tất cả đáp án đúng" (người thi phải chọn đúng và đủ).
export function TrainingQuestionDialog({
  courseId,
  question,
}: {
  courseId: string;
  question?: QuestionRow;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<DraftOption[]>(blankOptions);

  function resetDraft() {
    setError(null);
    setOptions(
      question
        ? question.options.map((o, key) => ({ key, text: o.text, correct: o.correct }))
        : blankOptions(),
    );
  }

  function patchOption(key: number, patch: Partial<DraftOption>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("options_json", JSON.stringify(options.map(({ text, correct }) => ({ text, correct }))));
    startTransition(async () => {
      const result = await upsertTrainingQuestion(courseId, question?.id ?? null, undefined, formData);
      if (result && "error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  const correctCount = options.filter((o) => o.correct && o.text.trim()).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetDraft();
      }}
    >
      <DialogTrigger
        render={
          question ? (
            <Button variant="ghost" size="icon-sm">
              <Pencil className="size-4" />
              <span className="sr-only">Sửa câu hỏi</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Thêm câu hỏi
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{question ? "Sửa câu hỏi" : "Thêm câu hỏi"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="question_text">Câu hỏi</Label>
            <Textarea
              id="question_text"
              name="question_text"
              rows={3}
              defaultValue={question?.question_text}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Đáp án — tick ô bên trái cho đáp án ĐÚNG</Label>
              {correctCount > 1 && (
                <span className="text-xs text-muted-foreground">Câu chọn nhiều đáp án</span>
              )}
            </div>
            {options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={o.correct}
                  onChange={(e) => patchOption(o.key, { correct: e.target.checked })}
                  className="size-4 shrink-0 accent-primary"
                  aria-label={`Đáp án ${i + 1} là đáp án đúng`}
                />
                <Input
                  value={o.text}
                  onChange={(e) => patchOption(o.key, { text: e.target.value })}
                  placeholder={`Đáp án ${i + 1}`}
                  maxLength={500}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((prev) => prev.filter((x) => x.key !== o.key))}
                >
                  <X className="size-4" />
                  <span className="sr-only">Bỏ đáp án</span>
                </Button>
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setOptions((prev) => [
                    ...prev,
                    { key: Math.max(...prev.map((x) => x.key)) + 1, text: "", correct: false },
                  ])
                }
              >
                <Plus className="size-4" />
                Thêm đáp án
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Ô để trống sẽ tự bỏ qua. Thứ tự đáp án được đảo ngẫu nhiên mỗi lần thi.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="explanation">Giải thích (hiện khi xem lại bài đã nộp)</Label>
            <Textarea
              id="explanation"
              name="explanation"
              rows={2}
              defaultValue={question?.explanation ?? ""}
              placeholder="Vì sao đáp án này đúng?"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu câu hỏi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
