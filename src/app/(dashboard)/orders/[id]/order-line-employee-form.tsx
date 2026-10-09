"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignOrderLineEmployee } from "@/lib/actions/orders";
import type { DeliveryMethod } from "@/types/database";
import { useUnsavedSection } from "@/components/unsaved-changes";
import { cn } from "@/lib/utils";

interface EmployeeOption {
  id: string;
  name: string;
}

const UNASSIGNED = "__unassigned__";

const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  self_ride: "Tự chạy xe máy",
  external_service: "Đặt xe dịch vụ",
};

// Người thực hiện (+ phương thức giao) của dòng — đổi xong lưu bằng thanh
// "Lưu thay đổi" chung (B1).
export function OrderLineEmployeeForm({
  lineId,
  employeeId,
  employees,
  isTransportLine,
  deliveryMethod,
  itemLabel,
}: {
  lineId: string;
  employeeId: string | null;
  employees: EmployeeOption[];
  isTransportLine?: boolean;
  deliveryMethod?: DeliveryMethod | null;
  itemLabel?: string | null;
}) {
  const savedEmployee = employeeId ?? UNASSIGNED;
  const savedMethod = deliveryMethod ?? "";
  const [employee, setEmployee] = useState(savedEmployee);
  const [method, setMethod] = useState<string>(savedMethod);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Trang tải lại sau khi lưu → theo giá trị mới.
  const [prevSaved, setPrevSaved] = useState(`${savedEmployee}|${savedMethod}`);
  if (prevSaved !== `${savedEmployee}|${savedMethod}`) {
    setPrevSaved(`${savedEmployee}|${savedMethod}`);
    setEmployee(savedEmployee);
    setMethod(savedMethod);
  }
  const dirty = employee !== savedEmployee || method !== savedMethod;
  useUnsavedSection(`employee:${lineId}`, `Người thực hiện${itemLabel ? ` · ${itemLabel}` : ""}`, dirty, save);

  function save() {
    setError(null);
    const fd = new FormData();
    if (employee !== UNASSIGNED) fd.set("employee_id", employee);
    if (isTransportLine && method) fd.set("delivery_method", method);
    startTransition(async () => {
      const result = await assignOrderLineEmployee(lineId, undefined, fd);
      if (result && "error" in result) setError(result.error);
    });
  }

  const ring = dirty && "border-amber-400 bg-[#FFFBEB] dark:bg-amber-950/30";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select value={employee} onValueChange={(v) => setEmployee((v as string | null) ?? UNASSIGNED)} disabled={pending}>
        <SelectTrigger className={cn("h-8 w-40", employee !== savedEmployee && ring)}>
          <SelectValue placeholder="Người thực hiện">
            {(value: string) =>
              value === UNASSIGNED ? "— Chưa gán —" : (employees.find((e) => e.id === value)?.name ?? "—")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>— Chưa gán —</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isTransportLine && (
        <Select value={method || null} onValueChange={(v) => setMethod((v as string | null) ?? "")} disabled={pending}>
          <SelectTrigger className={cn("h-8 w-40", method !== savedMethod && ring)}>
            <SelectValue placeholder="Phương thức">
              {(value: DeliveryMethod) => DELIVERY_METHOD_LABELS[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(DELIVERY_METHOD_LABELS) as [DeliveryMethod, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
