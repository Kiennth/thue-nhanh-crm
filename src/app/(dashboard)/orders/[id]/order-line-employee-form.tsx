"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignOrderLineEmployee } from "@/lib/actions/orders";
import type { DeliveryMethod } from "@/types/database";

interface EmployeeOption {
  id: string;
  name: string;
}

const UNASSIGNED = "__unassigned__";

const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  self_ride: "Tự chạy xe máy",
  external_service: "Đặt xe dịch vụ",
};

export function OrderLineEmployeeForm({
  lineId,
  employeeId,
  employees,
  isTransportLine,
  deliveryMethod,
}: {
  lineId: string;
  employeeId: string | null;
  employees: EmployeeOption[];
  isTransportLine?: boolean;
  deliveryMethod?: DeliveryMethod | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    if (formData.get("employee_id") === UNASSIGNED) {
      formData.delete("employee_id");
    }
    startTransition(async () => {
      const result = await assignOrderLineEmployee(lineId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      key={`${employeeId ?? ""}-${deliveryMethod ?? ""}`}
      action={handleSubmit}
      className="flex items-center gap-1"
    >
      <Select name="employee_id" defaultValue={employeeId ?? UNASSIGNED}>
        <SelectTrigger className="h-8 w-36">
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
        <Select name="delivery_method" defaultValue={deliveryMethod ?? undefined}>
          <SelectTrigger className="h-8 w-36">
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
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
