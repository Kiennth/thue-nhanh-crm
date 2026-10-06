import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EQUIPMENT_WRITE_ROLES } from "@/lib/roles";
import { StocktakeClient } from "./stocktake-client";

// Kiểm kho bằng bảng tính (CEO 2026-10-06) — xem lib/actions/stocktake.ts.
export default async function StocktakePage() {
  const employee = await requireRole([...EQUIPMENT_WRITE_ROLES]);
  const supabase = await createClient();
  const [{ data: branches }, { data: categories }] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("equipment_categories").select("id, name").eq("is_active", true).order("sort_order"),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/equipment" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Thiết bị
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Kiểm kho bằng bảng tính</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Xuất danh sách máy theo serial ra file, sửa trên Google Sheets hoặc Excel (serial, biến thể, kho, ghi chú,
          ngày hết bảo hành, thêm máy mới, xoá máy không còn), rồi tải lên lại. CRM hiện bảng thay đổi để duyệt trước khi
          ghi. Máy không có trong file thì không bị đụng tới.
        </p>
      </div>
      <StocktakeClient
        branches={branches ?? []}
        categories={categories ?? []}
        lockedBranchId={employee.role === "cua_hang_truong" ? employee.branch_id : null}
      />
    </div>
  );
}
