"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/date-input";
import { saveEmployeeProfile } from "@/lib/actions/employees";

export interface EmployeeProfile {
  company_phone: string | null;
  personal_phone: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  facebook_url: string | null;
  citizen_id: string | null;
  citizen_id_issued_on: string | null;
  citizen_id_issued_place: string | null;
  address: string | null;
  notes: string | null;
  joined_on?: string | null;
}

function Field({
  id,
  label,
  value,
  placeholder,
  type = "text",
}: {
  id: keyof EmployeeProfile;
  label: string;
  value: string | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} defaultValue={value ?? ""} placeholder={placeholder} />
    </div>
  );
}

// Hồ sơ nhân viên (CEO 2026-10-05) — sửa thẳng trên trang, bấm Lưu 1 lần.
export function EmployeeProfileForm({
  employeeId,
  birthday,
  profile,
}: {
  employeeId: string;
  birthday: string | null;
  profile: EmployeeProfile | null;
}) {
  const [pending, start] = useTransition();
  const p = profile;

  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await saveEmployeeProfile(employeeId, undefined, fd);
          if (r && "error" in r) toast.error(r.error);
          else toast.success("Đã lưu hồ sơ nhân viên");
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liên hệ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="birthday">Ngày sinh</Label>
              <DateInput id="birthday" name="birthday" defaultValue={birthday ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="joined_on">Ngày vào công ty</Label>
              <DateInput id="joined_on" name="joined_on" defaultValue={p?.joined_on ?? ""} />
            </div>
            <Field id="company_phone" label="SĐT công ty" value={p?.company_phone ?? null} />
            <Field id="personal_phone" label="SĐT cá nhân" value={p?.personal_phone ?? null} />
            <Field id="facebook_url" label="Facebook" value={p?.facebook_url ?? null} placeholder="facebook.com/..." />
            <div className="sm:col-span-2">
              <Field id="address" label="Địa chỉ" value={p?.address ?? null} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liên lạc khẩn cấp</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="emergency_name" label="Họ tên người liên lạc" value={p?.emergency_name ?? null} />
            <Field id="emergency_relation" label="Quan hệ" value={p?.emergency_relation ?? null} placeholder="Bố, mẹ, vợ/chồng..." />
            <Field id="emergency_phone" label="SĐT khẩn cấp" value={p?.emergency_phone ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Căn cước công dân</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="citizen_id" label="Số CCCD" value={p?.citizen_id ?? null} />
            <div className="space-y-1.5">
              <Label htmlFor="citizen_id_issued_on">Ngày cấp</Label>
              <DateInput id="citizen_id_issued_on" name="citizen_id_issued_on" defaultValue={p?.citizen_id_issued_on ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Field id="citizen_id_issued_place" label="Nơi cấp" value={p?.citizen_id_issued_place ?? null} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ghi chú</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea id="notes" name="notes" rows={5} defaultValue={p?.notes ?? ""} placeholder="Ghi chú nội bộ về nhân viên..." />
          </CardContent>
        </Card>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu hồ sơ"}
      </Button>
    </form>
  );
}
