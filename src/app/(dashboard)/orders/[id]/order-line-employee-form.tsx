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

interface EmployeeOption {
  id: string;
  name: string;
}

const UNASSIGNED = "__unassigned__";

export function OrderLineEmployeeForm({
  lineId,
  employeeId,
  employees,
}: {
  lineId: string;
  employeeId: string | null;
  employees: EmployeeOption[];
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
    <form key={employeeId ?? ""} action={handleSubmit} className="flex items-center gap-1">
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
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
