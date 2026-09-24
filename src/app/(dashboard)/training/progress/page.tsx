import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { requireRole } from "@/lib/dal";
import { ROLE_LABELS, TRAINING_MANAGE_ROLES } from "@/lib/roles";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { deleteTrainingAttempt } from "@/lib/actions/training";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

interface AttemptLite {
  id: string;
  course_id: string;
  employee_id: string;
  submitted_at: string | null;
  correct_count: number | null;
  total_count: number;
  score_percent: number | null;
  passed: boolean | null;
}

// Bảng tiến độ đào tạo (Giám đốc/Admin): nhân viên × khoá học đang mở. Ô đỏ
// = khoá BẮT BUỘC với vị trí đó mà chưa đạt. Bấm tên nhân viên để xem từng
// lần thi + xoá lần thi (trả lại lượt khi khoá giới hạn số lần).
export default async function TrainingProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const { employee: selectedId } = await searchParams;
  const supabase = await createClient();

  const [{ data: courses }, { data: employees }, attempts] = await Promise.all([
    supabase
      .from("training_courses")
      .select("id, title, required_roles")
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at"),
    supabase.from("employees_public").select("id, name, role").eq("is_active", true).order("name"),
    // Bảng bài thi chỉ có tăng — qua mốc 1.000 dòng PostgREST sẽ âm thầm cắt.
    fetchAllRows<AttemptLite>((from, to) =>
      supabase
        .from("training_attempts")
        .select("id, course_id, employee_id, submitted_at, correct_count, total_count, score_percent, passed")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const courseRows = courses ?? [];
  const employeeRows = employees ?? [];

  // key `${employee}:${course}` → tóm tắt các lần thi.
  const summary = new Map<string, { best: AttemptLite; count: number; passed: boolean }>();
  for (const a of attempts) {
    const key = `${a.employee_id}:${a.course_id}`;
    const cur = summary.get(key);
    if (!cur) summary.set(key, { best: a, count: 1, passed: !!a.passed });
    else {
      cur.count += 1;
      cur.passed ||= !!a.passed;
      if ((a.score_percent ?? 0) > (cur.best.score_percent ?? 0)) cur.best = a;
    }
  }

  let requiredTotal = 0;
  let requiredPassed = 0;
  for (const e of employeeRows) {
    for (const c of courseRows) {
      if (!c.required_roles.includes(e.role)) continue;
      requiredTotal += 1;
      if (summary.get(`${e.id}:${c.id}`)?.passed) requiredPassed += 1;
    }
  }

  const selected = employeeRows.find((e) => e.id === selectedId);
  const selectedAttempts = selected ? attempts.filter((a) => a.employee_id === selected.id) : [];
  const courseTitle = new Map(courseRows.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-4">
      <Link href="/training" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Đào tạo
      </Link>
      <h1 className="text-2xl font-semibold">Tiến độ đào tạo</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Khoá bắt buộc đã đạt (toàn công ty)"
          value={`${requiredPassed}/${requiredTotal}`}
        >
          <p className="text-xs text-muted-foreground">
            {requiredTotal ? Math.round((requiredPassed / requiredTotal) * 100) : 0}% hoàn thành
          </p>
        </StatCard>
        <StatCard label="Tổng lượt thi đã nộp" value={attempts.length} />
      </div>

      {courseRows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">Nhân viên</TableHead>
              {courseRows.map((c) => (
                <TableHead key={c.id} className="min-w-36 whitespace-normal">
                  <Link href={`/training/${c.id}/edit`} className="hover:text-primary">
                    {c.title}
                  </Link>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employeeRows.map((e) => (
              <TableRow key={e.id} className={e.id === selectedId ? "bg-muted/50" : undefined}>
                <TableCell>
                  <Link href={`/training/progress?employee=${e.id}`} className="font-medium hover:text-primary">
                    {e.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[e.role]}</p>
                </TableCell>
                {courseRows.map((c) => {
                  const cell = summary.get(`${e.id}:${c.id}`);
                  const required = c.required_roles.includes(e.role);
                  return (
                    <TableCell key={c.id}>
                      {cell ? (
                        <Link href={`/training/${c.id}/attempts/${cell.best.id}`} className="inline-block">
                          {cell.passed ? (
                            <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                              Đạt {cell.best.score_percent}%
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Chưa đạt {cell.best.score_percent}%</Badge>
                          )}
                          <span className="ml-1.5 text-xs text-muted-foreground">{cell.count} lần</span>
                        </Link>
                      ) : required ? (
                        <Badge variant="destructive">Chưa thi</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">Chưa có khoá học nào đang mở.</p>
      )}

      {selected && (
        <div className="space-y-2">
          <h2 className="font-semibold">Các lần thi của {selected.name}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khoá học</TableHead>
                <TableHead>Thời điểm nộp</TableHead>
                <TableHead className="text-right">Số câu đúng</TableHead>
                <TableHead className="text-right">Điểm</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedAttempts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{courseTitle.get(a.course_id) ?? "(khoá đã ẩn)"}</TableCell>
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
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/training/${a.course_id}/attempts/${a.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Xem bài
                      </Link>
                      <ConfirmDeleteButton
                        confirmMessage={`Xoá lần thi này của ${selected.name}? Dùng khi cần trả lại lượt thi — kết quả lần này sẽ mất.`}
                        successMessage="Đã xoá lần thi."
                        action={deleteTrainingAttempt}
                        actionArg={a.id}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!selectedAttempts.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {selected.name} chưa thi lần nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
