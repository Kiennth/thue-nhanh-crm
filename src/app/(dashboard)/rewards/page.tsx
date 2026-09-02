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
import { RuleDialog } from "./rule-dialog";
import { ApplyRuleButton } from "./apply-rule-button";
import { deleteRewardRule } from "@/lib/actions/rewards";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

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
  const [
    { data: entries },
    { data: employees },
    { data: bonusTiers },
    { data: branches },
    { data: rules },
    monthOrders,
  ] = await Promise.all([
    supabase
      .from("reward_entries")
      .select("id, employee_id, entry_date, amount, reason, category, rule_id, created_by")
      .gte("entry_date", rangeStart)
      .lt("entry_date", rangeEnd)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id, name, is_active, birthday"),
    supabase.from("bonus_tiers").select("branch_id, tier_number, threshold_amount, bonus_amount"),
    supabase.from("branches").select("id, name").order("position"),
    supabase
      .from("reward_rules")
      .select("id, rule_type, label, amount, threshold_amount, employee_id, is_active")
      .eq("is_active", true)
      .order("created_at"),
    // Doanh số tháng đang xem cho qui tắc doanh_so — đơn ĐÃ GIAO HÀNG, GỒM
    // VAT (khớp "Tổng doanh số" trang Đơn hàng, CEO 2026-09-02 — lưu ý các
    // mốc thưởng doanh_so đặt theo nền cũ giờ dễ đạt hơn ~8%).
    fetchAllRows<{ total_value: number }>((from, to) =>
      supabase
        .from("orders")
        .select("total_value")
        .is("cancelled_at", null)
        .not("delivered_at", "is", null)
        .gte("order_date", rangeStart)
        .lt("order_date", rangeEnd)
        .range(from, to),
    ).then((rows) =>
      rows.map((o) => ({ ...o, total_value: Math.round(o.total_value * 1.08 * 100) / 100 })),
    ),
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

  // Sinh nhật trong tháng đang xem — chỉ nhân viên đang hoạt động có khai
  // ngày sinh. "Đã thưởng" = có khoản loại sinh_nhat cho người đó trong tháng.
  const birthdayEmployees = employeeList
    .filter((e) => e.is_active && e.birthday && e.birthday.slice(5, 7) === monthStr)
    .sort((a, b) => (a.birthday ?? "").slice(8) < (b.birthday ?? "").slice(8) ? -1 : 1);
  const birthdayRewardedIds = new Set(
    allEntries.filter((e) => e.category === "sinh_nhat").map((e) => e.employee_id),
  );
  const missingBirthdayCount = employeeList.filter((e) => e.is_active && !e.birthday).length;

  // Qui tắc: doanh_so so với doanh số tháng; cả 2 loại check "đã áp trong
  // tháng" qua rule_id trên entries.
  const monthRevenue = monthOrders.reduce((sum, o) => sum + o.total_value, 0);
  const appliedRuleIds = new Set(allEntries.map((e) => e.rule_id).filter(Boolean));
  const ruleList = rules ?? [];
  const revenueRules = ruleList.filter((r) => r.rule_type === "doanh_so");
  const recurringRules = ruleList.filter((r) => r.rule_type === "dinh_ky");
  const recipientLabel = (employeeId: string | null) =>
    employeeId ? (employeeNameById.get(employeeId) ?? "—") : "Cả công ty";

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Sinh nhật tháng đang xem — nhắc để không quên, trao thì bấm Trao
            thưởng chọn loại Sinh nhật. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sinh nhật tháng {monthLabel} 🎂</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {birthdayEmployees.length ? (
              <ul className="space-y-1">
                {birthdayEmployees.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                  >
                    <span className="font-medium">{emp.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {emp.birthday!.slice(8, 10)}/{emp.birthday!.slice(5, 7)}
                      </span>
                      {birthdayRewardedIds.has(emp.id) ? (
                        <Badge>Đã thưởng ✓</Badge>
                      ) : (
                        <Badge variant="outline">Chưa thưởng</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Không có sinh nhật nào trong tháng (trong số nhân viên đã khai ngày sinh).
              </p>
            )}
            {missingBirthdayCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {missingBirthdayCount} nhân viên chưa khai ngày sinh — bổ sung ở trang{" "}
                {isDirector ? (
                  <Link href="/employees" className="text-primary underline-offset-2 hover:underline">
                    Nhân viên
                  </Link>
                ) : (
                  "Nhân viên"
                )}
                .
              </p>
            )}
          </CardContent>
        </Card>

        {/* Qui tắc thưởng — doanh_so: theo dõi mốc, ĐẠT thì hiện Trao ngay;
            dinh_ky: Áp kỳ này 1 chạm. Không tự động — Giám đốc luôn là người
            bấm. */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Qui tắc thưởng</CardTitle>
              {isDirector && <RuleDialog employees={activeEmployees} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {!ruleList.length && (
              <p className="text-sm text-muted-foreground">
                Chưa có qui tắc nào. Tạo qui tắc doanh số (đạt mốc thì gợi ý trao) hoặc định kỳ
                (áp 1 chạm mỗi tháng).
              </p>
            )}
            {revenueRules.map((rule) => {
              const reached = monthRevenue >= (rule.threshold_amount ?? 0);
              const applied = appliedRuleIds.has(rule.id);
              const progressPct = Math.min(
                100,
                Math.round((monthRevenue / (rule.threshold_amount ?? 1)) * 100),
              );
              return (
                <div key={rule.id} className="space-y-1.5 rounded-lg border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{rule.label}</span>
                    <span className="flex items-center gap-1">
                      {applied ? (
                        <Badge>Đã trao ✓</Badge>
                      ) : reached ? (
                        isDirector ? (
                          <ApplyRuleButton ruleId={rule.id} month={month} label="Trao ngay" />
                        ) : (
                          <Badge>ĐẠT MỐC</Badge>
                        )
                      ) : (
                        <Badge variant="outline">Chưa đạt</Badge>
                      )}
                      {isDirector && (
                        <ConfirmDeleteButton
                          confirmMessage={`Xoá qui tắc "${rule.label}"? Khoản đã trao vẫn giữ trong sổ.`}
                          successMessage="Đã xoá qui tắc."
                          action={deleteRewardRule}
                          actionArg={rule.id}
                        />
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Doanh số tháng {currencyFormatter.format(monthRevenue)}đ /{" "}
                    {currencyFormatter.format(rule.threshold_amount ?? 0)}đ ({progressPct}%) —
                    thưởng {currencyFormatter.format(rule.amount)}đ ·{" "}
                    {recipientLabel(rule.employee_id)}
                  </p>
                </div>
              );
            })}
            {recurringRules.map((rule) => {
              const applied = appliedRuleIds.has(rule.id);
              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{rule.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {currencyFormatter.format(rule.amount)}đ/tháng ·{" "}
                      {recipientLabel(rule.employee_id)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    {applied ? (
                      <Badge>Đã áp tháng này ✓</Badge>
                    ) : isDirector ? (
                      <ApplyRuleButton ruleId={rule.id} month={month} label="Áp kỳ này" />
                    ) : (
                      <Badge variant="outline">Chưa áp</Badge>
                    )}
                    {isDirector && (
                      <ConfirmDeleteButton
                        confirmMessage={`Xoá qui tắc "${rule.label}"? Khoản đã áp vẫn giữ trong sổ.`}
                        successMessage="Đã xoá qui tắc."
                        action={deleteRewardRule}
                        actionArg={rule.id}
                      />
                    )}
                  </span>
                </div>
              );
            })}
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
