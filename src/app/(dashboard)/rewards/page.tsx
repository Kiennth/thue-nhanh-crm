import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { requireRole, getCurrentEmployee } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { deleteReward } from "@/lib/actions/rewards";
import { currentMonth } from "@/lib/employee-performance-charts";
import { REWARD_CATEGORY_LABELS, REWARD_CATEGORY_OPTIONS } from "@/lib/reward-labels";
import type { RewardCategory } from "@/types/database";
import { MonthNavigator } from "../payroll/month-navigator";
import { RewardDialog } from "./reward-dialog";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function isRewardCategory(value: string): value is RewardCategory {
  return value in REWARD_CATEGORY_LABELS;
}

// Module Thưởng (CEO 2026-08-09) — một chỗ nhìn thấy hết các loại thưởng:
// sổ thưởng trao tay (bất chợt/doanh số/định kỳ/Tết/sinh nhật/khác, bảng
// reward_entries) + tóm tắt thưởng THEO KHOÁN tự động (bonus_tiers, cấu
// hình ở Chính sách khoán — không trao tay ở đây). Giám đốc/Admin/Kế toán
// xem; trao/xoá chỉ Giám đốc (RLS cũng chặn đúng vậy).
export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cat?: string }>;
}) {
  await requireRole([...MANAGE_ROLES]);
  const viewer = await getCurrentEmployee();
  if (!viewer) return null;

  const { month: monthParam, cat } = await searchParams;
  const month = monthParam ?? currentMonth();
  const activeCat = cat && isRewardCategory(cat) ? cat : null;

  const [yearStr, monthStr] = month.split("-");
  const rangeStart = `${month}-01`;
  const rangeEnd =
    Number(monthStr) === 12
      ? `${Number(yearStr) + 1}-01-01`
      : `${yearStr}-${String(Number(monthStr) + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();
  const [{ data: entries }, { data: employees }, { data: bonusTiers }, { data: branches }] =
    await Promise.all([
      supabase
        .from("reward_entries")
        .select("id, employee_id, entry_date, amount, reason, category, created_by")
        .gte("entry_date", rangeStart)
        .lt("entry_date", rangeEnd)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("employees").select("id, name, is_active"),
      supabase.from("bonus_tiers").select("branch_id, tier_number, threshold_amount, bonus_amount"),
      supabase.from("branches").select("id, name").order("position"),
    ]);

  const employeeList = employees ?? [];
  const employeeNameById = new Map(employeeList.map((e) => [e.id, e.name]));
  const activeEmployees = employeeList
    .filter((e) => e.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const allEntries = entries ?? [];
  const monthTotal = allEntries.reduce((sum, e) => sum + e.amount, 0);
  const recipientCount = new Set(allEntries.map((e) => e.employee_id)).size;
  const totalByCategory = new Map<RewardCategory, number>();
  for (const e of allEntries) {
    totalByCategory.set(e.category, (totalByCategory.get(e.category) ?? 0) + e.amount);
  }
  const visibleEntries = activeCat
    ? allEntries.filter((e) => e.category === activeCat)
    : allEntries;

  const branchList = branches ?? [];
  const tiersByBranch = new Map(
    branchList.map((b) => [
      b.id,
      (bonusTiers ?? [])
        .filter((t) => t.branch_id === b.id)
        .sort((a, b2) => a.tier_number - b2.tier_number),
    ]),
  );

  const isDirector = viewer.role === "giam_doc";
  const monthLabel = `${monthStr}/${yearStr}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Thưởng</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isDirector && <RewardDialog employees={activeEmployees} />}
          <MonthNavigator month={month} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng thưởng đã trao — tháng {monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{currencyFormatter.format(monthTotal)}đ</p>
            <p className="text-xs text-muted-foreground">
              Chưa gồm thưởng theo khoán (tự động cộng ở Bảng lương)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Số khoản</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{allEntries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Số người được thưởng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{recipientCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lọc theo loại — chip là link giữ nguyên tháng đang xem. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1 w-fit">
        <Link
          href={`/rewards?month=${month}`}
          className={`rounded-md px-2.5 py-1 text-sm ${!activeCat ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Tất cả
        </Link>
        {REWARD_CATEGORY_OPTIONS.map((opt) => {
          const catTotal = totalByCategory.get(opt.value) ?? 0;
          return (
            <Link
              key={opt.value}
              href={`/rewards?month=${month}&cat=${opt.value}`}
              className={`rounded-md px-2.5 py-1 text-sm ${activeCat === opt.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {opt.label}
              {catTotal > 0 && (
                <span className="ml-1 text-xs opacity-70">
                  {currencyFormatter.format(catTotal)}đ
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày</TableHead>
            <TableHead>Người nhận</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead>Lý do</TableHead>
            <TableHead>Người trao</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            {isDirector && <TableHead className="w-14"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleEntries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.entry_date.split("-").reverse().join("/")}</TableCell>
              <TableCell className="font-medium">
                {employeeNameById.get(entry.employee_id) ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{REWARD_CATEGORY_LABELS[entry.category]}</Badge>
              </TableCell>
              <TableCell className="max-w-72 truncate" title={entry.reason}>
                {entry.reason}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {entry.created_by ? (employeeNameById.get(entry.created_by) ?? "—") : "—"}
              </TableCell>
              <TableCell className="text-right font-medium">
                {currencyFormatter.format(entry.amount)}đ
              </TableCell>
              {isDirector && (
                <TableCell>
                  <ConfirmDeleteButton
                    confirmMessage={`Xoá khoản thưởng ${currencyFormatter.format(entry.amount)}đ cho ${employeeNameById.get(entry.employee_id) ?? ""}? Thao tác được ghi vào nhật ký.`}
                    successMessage="Đã xoá khoản thưởng."
                    action={deleteReward}
                    actionArg={entry.id}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {!visibleEntries.length && (
            <TableRow>
              <TableCell
                colSpan={isDirector ? 7 : 6}
                className="text-center text-muted-foreground"
              >
                {activeCat
                  ? `Chưa có khoản thưởng loại "${REWARD_CATEGORY_LABELS[activeCat]}" trong tháng.`
                  : "Chưa có khoản thưởng nào trong tháng."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Thưởng theo khoán — TỰ ĐỘNG, qui luật riêng, chỉ tóm tắt để nhìn 1
          chỗ thấy hết; cấu hình bậc ở Chính sách khoán (Giám đốc). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thưởng theo khoán (tự động)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nhân viên đạt mốc tổng khoán trong tháng thì tự nhận mức thưởng của mốc cao nhất đã
            chạm — hệ thống tự tính vào Bảng lương, không cần trao tay.
            {viewer.role !== "admin" && (
              <>
                {" "}
                Chỉnh mốc ở{" "}
                <Link href="/commission" className="text-primary underline-offset-2 hover:underline">
                  Chính sách khoán
                </Link>
                .
              </>
            )}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {branchList.map((branch) => {
              const tiers = tiersByBranch.get(branch.id) ?? [];
              return (
                <div key={branch.id} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">{branch.name}</p>
                  {tiers.length ? (
                    <ul className="space-y-1 text-sm">
                      {tiers.map((tier) => (
                        <li key={tier.tier_number} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Khoán ≥ {currencyFormatter.format(tier.threshold_amount)}đ
                          </span>
                          <span className="font-medium">
                            +{currencyFormatter.format(tier.bonus_amount)}đ
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa cấu hình bậc thưởng.</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
