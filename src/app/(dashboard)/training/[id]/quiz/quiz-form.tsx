"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitTrainingAttempt } from "@/lib/actions/training";
import { formatCountdown } from "@/lib/training";
import type { TrainingActiveAttempt } from "@/types/database";

type Answers = Record<string, string[]>;

// Kho bài làm: bộ nhớ là chính, sessionStorage là bản lưu để lỡ tải lại
// trang giữa chừng không mất bài (sessionStorage bị chặn thì vẫn thi bình
// thường, chỉ mất phần khôi phục). Đọc qua useSyncExternalStore để server
// render ra bài trống, client tự nạp lại bản lưu mà không lệch hydration.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readDraft(key: string): string | null {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, answers: Answers) {
  const raw = JSON.stringify(answers);
  memory.set(key, raw);
  try {
    sessionStorage.setItem(key, raw);
  } catch {}
  listeners.forEach((l) => l());
}

function parseDraft(raw: string | null): Answers {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Answers) : {};
  } catch {
    return {};
  }
}

// Form làm bài thi. Đề ở đây ĐÃ bóc đáp án đúng (RPC training_active_attempt)
// nên soi DevTools cũng không ra; chấm điểm + kiểm giờ nằm ở DB. Đồng hồ
// bên dưới chỉ để người thi biết giờ và tự nộp khi hết — sửa đồng hồ máy
// không kéo dài được bài thi.
export function QuizForm({
  courseId,
  courseTitle,
  attempt,
}: {
  courseId: string;
  courseTitle: string;
  attempt: TrainingActiveAttempt;
}) {
  const storageKey = `training-attempt-${attempt.id}`;
  const draft = useSyncExternalStore(
    subscribe,
    () => readDraft(storageKey),
    () => null,
  );
  const answers = useMemo(() => parseDraft(draft), [draft]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(attempt.seconds_left);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittedRef = useRef(false);

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    startTransition(async () => {
      const result = await submitTrainingAttempt(courseId, attempt.id, parseDraft(readDraft(storageKey)));
      // Thành công thì action tự redirect sang trang kết quả — tới được đây là có lỗi.
      if (result && "error" in result) {
        submittedRef.current = false;
        setError(result.error);
      }
    });
  }, [attempt.id, courseId, storageKey]);

  // Đếm ngược theo mốc tuyệt đối (không trừ dần từng giây) để tab bị trình
  // duyệt cho "ngủ" rồi mở lại vẫn ra đúng giờ còn lại.
  useEffect(() => {
    if (attempt.seconds_left == null) return;
    const deadline = Date.now() + attempt.seconds_left * 1000;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) submit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt.seconds_left, submit]);

  function pick(questionId: string, optionId: string, multi: boolean) {
    const current = answers[questionId] ?? [];
    const nextPicked = multi
      ? current.includes(optionId)
        ? current.filter((x) => x !== optionId)
        : [...current, optionId]
      : [optionId];
    writeDraft(storageKey, { ...answers, [questionId]: nextPicked });
  }

  const answeredCount = attempt.questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const unanswered = attempt.questions.length - answeredCount;
  const timeLow = secondsLeft != null && secondsLeft <= 60;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Bài thi: {courseTitle}</p>
          <p className="text-xs text-muted-foreground">
            Đã trả lời {answeredCount}/{attempt.questions.length} · cần đúng từ {attempt.pass_percent}%
          </p>
        </div>
        {secondsLeft != null && (
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-sm font-semibold tabular-nums ${
              timeLow ? "border-destructive bg-destructive/10 text-destructive" : ""
            }`}
            aria-live={timeLow ? "polite" : "off"}
          >
            <Clock className="size-4" />
            {formatCountdown(secondsLeft)}
          </div>
        )}
      </div>

      {attempt.questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent>
            <fieldset className="space-y-3" disabled={pending}>
              <legend className="font-medium">
                <span className="text-muted-foreground">Câu {i + 1}.</span> {q.text}
              </legend>
              {q.multi && <p className="text-xs font-medium text-primary">Chọn TẤT CẢ đáp án đúng.</p>}
              <div className="space-y-2">
                {q.options.map((o) => {
                  const checked = (answers[q.id] ?? []).includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type={q.multi ? "checkbox" : "radio"}
                        name={`q-${q.id}`}
                        checked={checked}
                        onChange={() => pick(q.id, o.id, q.multi)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span>{o.text}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
        {confirming && unanswered > 0 ? (
          <>
            <p className="text-sm font-medium text-amber-700">
              Còn {unanswered} câu chưa trả lời — câu bỏ trống tính là sai. Vẫn nộp?
            </p>
            <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Làm tiếp
            </Button>
            <Button disabled={pending} onClick={submit}>
              {pending ? "Đang nộp..." : "Vẫn nộp bài"}
            </Button>
          </>
        ) : (
          <Button disabled={pending} onClick={() => (unanswered > 0 ? setConfirming(true) : submit())}>
            <Send className="size-4" />
            {pending ? "Đang nộp..." : "Nộp bài"}
          </Button>
        )}
      </div>
    </div>
  );
}
