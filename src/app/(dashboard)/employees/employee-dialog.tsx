"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import { ROLE_LABELS } from "@/lib/roles";
import type { UserRole } from "@/types/database";

interface Branch {
  id: string;
  name: string;
}

interface EmployeeDialogProps {
  trigger: React.ReactElement;
  branches: Branch[];
  employee?: {
    id: string;
    name: string;
    email: string | null;
    branch_id: string | null;
    base_salary: number;
    role: UserRole;
  };
}

const ROLE_OPTIONS: UserRole[] = ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"];

export function EmployeeDialog({ trigger, branches, employee }: EmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = employee
        ? await updateEmployee(employee.id, undefined, formData)
        : await createEmployee(undefined, formData);

      if (result && "error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
      }
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
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{employee ? "Sửa nhân viên" : "Thêm nhân viên"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Tên</Label>
            <Input id="name" name="name" defaultValue={employee?.name} required />
          </div>

          {employee ? (
            <div className="space-y-2">
              <Label>Email đăng nhập</Label>
              <p className="text-sm text-muted-foreground">{employee.email}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="email">Email (gửi lời mời đăng nhập)</Label>
              <Input id="email" name="email" type="email" required />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            <Select name="branch_id" defaultValue={employee?.branch_id ?? undefined}>
              <SelectTrigger id="branch_id" className="w-full">
                <SelectValue placeholder="Chọn chi nhánh">
                  {(value: string) => branches.find((b) => b.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_salary">Lương cứng (VNĐ)</Label>
            <Input
              id="base_salary"
              name="base_salary"
              type="number"
              min={0}
              step={1000}
              defaultValue={employee?.base_salary ?? 0}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Vai trò</Label>
            <Select name="role" defaultValue={employee?.role ?? "ky_thuat_sales"}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue>{(value: UserRole) => ROLE_LABELS[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
