import { notFound, redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/dal";
import { loadProfileData } from "@/lib/employee-profile-data";
import { ProfileView } from "@/components/employee-profile/profile-view";
import { SelfEditDialog } from "@/components/employee-profile/self-edit-dialog";

// Hồ sơ của tôi (CEO 2026-10-05) — mọi nhân viên.
export default async function MyProfilePage() {
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const data = await loadProfileData(me.id);
  if (!data) notFound();
  return (
    <ProfileView
      data={data}
      mode="self"
      actions={<SelfEditDialog profile={data.profile} birthday={data.employee.birthday} />}
    />
  );
}
