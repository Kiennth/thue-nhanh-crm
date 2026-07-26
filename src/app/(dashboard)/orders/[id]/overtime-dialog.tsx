"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { addOvertimeEntry } from "@/lib/actions/overtime";

interface EmployeeOption {
  id: string;
  name: string;
}

// Đơn giá OT mặc định — tự tính "Số tiền" khi nhập "Số giờ", vẫn sửa tay
// được nếu ca đó áp mức khác.
const DEFAULT_OT_RATE = 45000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function OvertimeDialog({
  orderId,
  employees,
}: {
  orderId: string;
  employees: EmployeeOption[];
}) {
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = (
    <Button variant="outline" size="sm">
      <Plus className="size-4" />
      Ghi nhận
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [hours, setHours] = useState("");
  const [amount, setAmount] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleHoursChange(next: string) {
    setHours(next);
    const parsed = Number(next);
    if (next && !Number.isNaN(parsed)) {
      setAmount(String(Math.round(parsed * DEFAULT_OT_RATE)));
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addOvertimeEntry(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setEmployeeId("");
        setHours("");
        setAmount("");
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
        <DialogHeader>
          <DialogTitle>Ghi nhận OT</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />

          <div className="space-y-2">
            <Label htmlFor="ot_employee_id">Nhân viên</Label>
            <Select name="employee_id" value={employeeId} onValueChange={(value) => setEmployeeId(value ?? "")}>
              <SelectTrigger id="ot_employee_id" className="w-full">
                <SelectValue placeholder="Chọn nhân viên">
                  {(value: string) => employees.find((e) => e.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_entry_date">Ngày</Label>
            <Input id="ot_entry_date" name="entry_date" type="date" defaultValue={todayStr()} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_hours">Số giờ (không bắt buộc)</Label>
            <Input
              id="ot_hours"
              name="hours"
              type="number"
              min={0}
              step={0.5}
              placeholder="Vd: 2.5"
              value={hours}
              onChange={(e) => handleHoursChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Đơn giá mặc định {DEFAULT_OT_RATE.toLocaleString("vi-VN")}đ/giờ — tự điền số tiền bên
              dưới, sửa lại nếu ca này áp mức khác.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_amount">Số tiền (đ)</Label>
            <Input
              id="ot_amount"
              name="amount"
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_note">Ghi chú</Label>
            <Input id="ot_note" name="note" placeholder="Không bắt buộc" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || !employeeId}>
            {pending ? "Đang lưu..." : "Ghi nhận OT"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
