import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export interface CurrentEmployee {
  id: string;
  name: string;
  role: UserRole;
  branch_id: string | null;
  base_salary: number;
}

// cache() gộp nhiều lần gọi trong cùng 1 lượt render thành 1 query.
export const getCurrentEmployee = cache(
  async (): Promise<CurrentEmployee | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data } = await supabase
      .from("employees")
      .select("id, name, role, branch_id, base_salary")
      .eq("user_id", user.id)
      .single();

    return data;
  },
);

// Dùng ở đầu Server Component/Server Action cần chặn theo role cụ thể.
export async function requireRole(allowed: UserRole[]) {
  const employee = await getCurrentEmployee();
  if (!employee || !allowed.includes(employee.role)) {
    redirect("/");
  }
  return employee;
}
