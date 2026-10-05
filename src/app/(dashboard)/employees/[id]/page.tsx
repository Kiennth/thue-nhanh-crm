import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import { loadProfileData } from "@/lib/employee-profile-data";
import { ProfileView } from "@/components/employee-profile/profile-view";
import { EmployeeProfileForm, type EmployeeProfile } from "./profile-form";

// Hồ sơ nhân viên — Giám đốc xem (giao diện như "Hồ sơ của tôi") + sửa toàn
// bộ ô (kể cả SĐT công ty, CCCD, ghi chú nội bộ) ở khối bên dưới.
export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...DIRECTOR_ONLY]);
  const { id } = await params;
  const data = await loadProfileData(id);
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
        ← Nhân viên
      </Link>
      <ProfileView data={data} mode="director" />
      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer text-base font-bold">Sửa hồ sơ (Giám đốc)</summary>
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
