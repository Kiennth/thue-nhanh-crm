import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { loadProfileData } from "@/lib/employee-profile-data";
import { ProfileView } from "@/components/employee-profile/profile-view";
import { EmployeeProfileForm, type EmployeeProfile } from "./profile-form";

// Hồ sơ nhân viên — Giám đốc/Admin/Kế toán xem (giao diện như "Hồ sơ của tôi") + sửa toàn
// bộ ô (kể cả SĐT công ty, CCCD, ghi chú nội bộ) ở khối bên dưới.
export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRole([...MANAGE_ROLES]);
  const { id } = await params;
  const data = await loadProfileData(id);
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
        ← Nhân viên
      </Link>
      {/* Admin không xem thu nhập/bậc thưởng; Kế toán làm lương nên xem được. */}
      <ProfileView data={data} mode="director" showMoney={viewer.role !== "admin"} />
      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer text-base font-bold">Sửa hồ sơ (quản lý)</summary>
        <div className="mt-4">
          <EmployeeProfileForm
            employeeId={data.employee.id}
            birthday={data.employee.birthday}
            profile={data.profile as EmployeeProfile | null}
          />
        </div>
      </details>
    </div>
  );
}
