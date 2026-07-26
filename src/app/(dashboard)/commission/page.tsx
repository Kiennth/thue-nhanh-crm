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
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { deleteBonusTier, deleteCommissionTier } from "@/lib/actions/commission";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import { CommissionTierDialog } from "./commission-tier-dialog";
import { BonusTierDialog } from "./bonus-tier-dialog";
import { TaskWeightRow } from "./task-weight-row";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export default async function CommissionPage() {
  const employee = await requireRole([...MANAGE_ROLES]);
  const canManage = employee.role === "giam_doc";

  const supabase = await createClient();
  const [{ data: branches }, { data: commissionTiers }, { data: bonusTiers }, { data: taskWeights }] =
    await Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("commission_tiers").select("*").order("tier_number"),
      supabase.from("bonus_tiers").select("*").order("tier_number"),
      supabase.from("task_weights").select("*"),
    ]);

  const branchList = branches ?? [];
  const commissionByBranch = new Map<string, NonNullable<typeof commissionTiers>>();
  for (const tier of commissionTiers ?? []) {
    const list = commissionByBranch.get(tier.branch_id) ?? [];
    list.push(tier);
    commissionByBranch.set(tier.branch_id, list);
  }
  const bonusByBranch = new Map<string, NonNullable<typeof bonusTiers>>();
  for (const tier of bonusTiers ?? []) {
    const list = bonusByBranch.get(tier.branch_id) ?? [];
    list.push(tier);
    bonusByBranch.set(tier.branch_id, list);
  }
  const weightByType = new Map((taskWeights ?? []).map((w) => [w.task_type, w]));
  const totalWeight = (taskWeights ?? []).reduce((sum, w) => sum + w.weight_percentage, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Chính sách khoán</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tỷ trọng đóng góp theo khâu{" "}
            <span
              className={totalWeight === 100 ? "text-muted-foreground" : "text-destructive"}
            >
              (Tổng: {totalWeight}%)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {TASK_TYPE_SEQUENCE.map((taskType) => {
            const w = weightByType.get(taskType);
            if (!w) return null;
            return canManage ? (
              <TaskWeightRow
                key={taskType}
                id={w.id}
                label={TASK_TYPE_LABELS[taskType]}
                weightPercentage={w.weight_percentage}
              />
            ) : (
              <div key={taskType} className="flex items-center justify-between border-b py-2 last:border-b-0">
                <span>{TASK_TYPE_LABELS[taskType]}</span>
                <span>{w.weight_percentage}%</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {branchList.map((branch) => {
        const tiers = commissionByBranch.get(branch.id) ?? [];
        const bonuses = bonusByBranch.get(branch.id) ?? [];

        return (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle className="text-base">{branch.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Bậc hoa hồng theo giá trị đơn</p>
                  {canManage && (
                    <CommissionTierDialog
                      branchId={branch.id}
                      nextTierNumber={tiers.length + 1}
                    />
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Từ</TableHead>
                      <TableHead>Đến</TableHead>
                      <TableHead>% hoa hồng</TableHead>
                      {canManage && <TableHead className="w-16"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((tier) => (
                      <TableRow key={tier.id}>
                        <TableCell>{currencyFormatter.format(tier.min_value)}đ</TableCell>
                        <TableCell>
                          {tier.max_value ? `${currencyFormatter.format(tier.max_value)}đ` : "Không giới hạn"}
                        </TableCell>
                        <TableCell>{tier.percentage}%</TableCell>
                        {canManage && (
                          <TableCell>
                            <ConfirmDeleteButton
                              confirmMessage="Xoá bậc hoa hồng này?"
                              successMessage="Đã xoá bậc hoa hồng."
                              action={deleteCommissionTier}
                              actionArg={tier.id}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {!tiers.length && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground">
                          Chưa có bậc hoa hồng nào.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Bậc thưởng theo tổng khoán tháng</p>
                  {canManage && (
                    <BonusTierDialog
                      branchId={branch.id}
                      nextTierNumber={bonuses.length + 1}
                    />
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngưỡng</TableHead>
                      <TableHead>Thưởng</TableHead>
                      {canManage && <TableHead className="w-16"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonuses.map((tier) => (
                      <TableRow key={tier.id}>
                        <TableCell>{currencyFormatter.format(tier.threshold_amount)}đ</TableCell>
                        <TableCell>{currencyFormatter.format(tier.bonus_amount)}đ</TableCell>
                        {canManage && (
                          <TableCell>
                            <ConfirmDeleteButton
                              confirmMessage="Xoá bậc thưởng này?"
                              successMessage="Đã xoá bậc thưởng."
                              action={deleteBonusTier}
                              actionArg={tier.id}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {!bonuses.length && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 3 : 2} className="text-center text-muted-foreground">
                          Chưa có bậc thưởng nào.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
