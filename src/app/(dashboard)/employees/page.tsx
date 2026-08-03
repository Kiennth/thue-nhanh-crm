import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BranchBadge } from "@/components/branch-badge";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY, MANAGE_ROLES as HR_ROLES, ROLE_LABELS } from "@/lib/roles";
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
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));

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
          {employees?.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-medium">{emp.name}</TableCell>
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
          {!employees?.length && (
            <TableRow>
              <TableCell colSpan={isHr ? 7 : 5} className="text-center text-muted-foreground">
                Chưa có nhân viên nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
