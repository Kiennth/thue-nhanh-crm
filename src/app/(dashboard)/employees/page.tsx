import { Fragment } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BranchBadge, branchColorVar } from "@/components/branch-badge";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, DIRECTOR_ONLY, MANAGE_ROLES as HR_ROLES, ROLE_LABELS } from "@/lib/roles";
import { EmployeeDialog } from "./employee-dialog";
import { ToggleActiveButton } from "./toggle-active-button";
const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export default async function EmployeesPage() {
  // Trang này trước chỉ ẩn/hiện nút theo vai trò, không chặn ai vào — gõ
  // thẳng URL là đọc được lương cứng của cả công ty. CEO chốt 2026-08-01
  // quản lý nhân sự chỉ còn Giám đốc, nên chặn ngay từ cửa.
  const currentEmployee = await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const [{ data: employees }, { data: branches }] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    supabase.from("branches").select("id, name").order("position"),
  ]);

  const isHr = HR_ROLES.includes(currentEmployee.role);
  const branchList = branches ?? [];
  // Thứ tự (CEO 2026-09-24): đang hoạt động trước → kho (theo
  // branches.position, chưa gán kho cuối) → cấp bậc (ALL_ROLES đã xếp từ
  // Giám đốc xuống Kỹ thuật/Sales) → ABC tiếng Việt. Sort ở JS vì collation
  // Postgres không xếp đúng dấu tiếng Việt (Đ, Â, Ơ...).
  const branchRank = new Map(branchList.map((b, i) => [b.id, i]));
  const rankOf = (branchId: string | null) =>
    branchId ? (branchRank.get(branchId) ?? branchList.length) : branchList.length;
  const sortedEmployees = [...(employees ?? [])].sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      rankOf(a.branch_id) - rankOf(b.branch_id) ||
      ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role) ||
      a.name.localeCompare(b.name, "vi"),
  );
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));

  // Chia ô theo kho (CEO 2026-10-01): mỗi kho 1 khối có dải tiêu đề + nền
  // nhuộm màu riêng của kho (cùng màu BranchBadge). Giữ nguyên thứ tự ở
  // trên nên nhân viên đã vô hiệu vẫn nằm cuối, gom thành 1 khối xám.
  const groups: { key: string; label: string; colorVar: string | null; members: typeof sortedEmployees }[] = [];
  for (const emp of sortedEmployees) {
    const branchName = emp.branch_id ? (branchNameById.get(emp.branch_id) ?? null) : null;
    const key = emp.is_active ? (emp.branch_id ?? "none") : "inactive";
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.members.push(emp);
    } else {
      groups.push({
        key,
        label: emp.is_active ? (branchName ?? "Chưa gán kho") : "Đã vô hiệu",
        colorVar: emp.is_active && branchName ? branchColorVar(branchName) : null,
        members: [emp],
      });
    }
  }
  const columnCount = isHr ? 7 : 5;
  // Không có màu riêng (chưa gán kho / đã vô hiệu) thì dùng xám trung tính.
  const tint = (colorVar: string | null, percent: number) =>
    `color-mix(in srgb, var(${colorVar ?? "--muted-foreground"}) ${percent}%, transparent)`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nhân viên</h1>
        {isHr && (
          <EmployeeDialog branches={branchList} />
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Chi nhánh</TableHead>
            <TableHead>Vai trò</TableHead>
            {isHr && <TableHead>Lương cứng</TableHead>}
            <TableHead>Trạng thái</TableHead>
            {isHr && <TableHead className="w-40"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <TableRow
                className="hover:bg-transparent"
                style={{ backgroundColor: tint(group.colorVar, 22) }}
              >
                <TableCell
                  colSpan={columnCount}
                  className="border-l-4 py-1.5 text-sm font-semibold"
                  style={{ borderLeftColor: `var(${group.colorVar ?? "--muted-foreground"})` }}
                >
                  {group.label}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {group.members.length} người
                  </span>
                </TableCell>
              </TableRow>
              {group.members.map((emp) => (
                <TableRow key={emp.id} style={{ backgroundColor: tint(group.colorVar, 7) }}>
                  <TableCell
                    className="border-l-4 font-medium"
                    style={{ borderLeftColor: `var(${group.colorVar ?? "--muted-foreground"})` }}
                  >
                    {/* Tên mở trang hồ sơ (CEO 2026-10-05). */}
                    <Link href={`/employees/${emp.id}`} className="hover:underline">
                      {emp.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.email ?? "—"}</TableCell>
                  <TableCell>
                    {emp.branch_id ? <BranchBadge name={branchNameById.get(emp.branch_id) ?? "—"} /> : "—"}
                  </TableCell>
                  <TableCell>{ROLE_LABELS[emp.role]}</TableCell>
                  {isHr && (
                    <TableCell>{currencyFormatter.format(emp.base_salary)}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant={emp.is_active ? "default" : "secondary"}>
                      {emp.is_active ? "Hoạt động" : "Vô hiệu"}
                    </Badge>
                  </TableCell>
                  {isHr && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EmployeeDialog branches={branchList} employee={emp} />
                        <ToggleActiveButton
                          id={emp.id}
                          name={emp.name}
                          isActive={emp.is_active}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </Fragment>
          ))}
          {!employees?.length && (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                Chưa có nhân viên nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
