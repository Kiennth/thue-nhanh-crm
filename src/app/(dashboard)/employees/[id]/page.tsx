import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BranchBadge } from "@/components/branch-badge";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY, ROLE_LABELS } from "@/lib/roles";
import { EmployeeProfileForm, type EmployeeProfile } from "./profile-form";

// Trang hồ sơ nhân viên (CEO 2026-10-05) — chỉ Giám đốc (cùng quyền trang
// Nhân viên; hồ sơ có số CCCD).
export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...DIRECTOR_ONLY]);
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: emp }, { data: profile }, { data: branches }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("employee_profiles" as never)
      .select("*")
      .eq("employee_id", id)
      .maybeSingle(),
    supabase.from("branches").select("id, name"),
  ]);
  if (!emp) notFound();
  const branchName = (branches ?? []).find((b) => b.id === emp.branch_id)?.name ?? null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
          ← Nhân viên
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{emp.name}</h1>
          <span className="text-muted-foreground">{ROLE_LABELS[emp.role]}</span>
          {branchName && <BranchBadge name={branchName} />}
          <Badge variant={emp.is_active ? "default" : "secondary"}>{emp.is_active ? "Hoạt động" : "Vô hiệu"}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{emp.email ?? "Chưa có email đăng nhập"}</p>
      </div>
      <EmployeeProfileForm
        employeeId={emp.id}
        birthday={emp.birthday}
        profile={(profile as unknown as EmployeeProfile | null) ?? null}
      />
    </div>
  );
}
