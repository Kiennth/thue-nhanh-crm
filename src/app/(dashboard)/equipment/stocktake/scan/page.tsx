import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { ScanClient } from "./scan-client";

// Quét kiểm kho (CEO 2026-10-07) — xem lib/actions/stocktake-scan.ts.
export default async function StocktakeScanPage() {
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
        <h1 className="mt-1 text-2xl font-bold">Quét kiểm kho</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Chọn kho, bấm Bắt đầu, rồi quét từng máy. CRM đối chiếu ngay: máy có mặt, máy còn thiếu, máy lạ (ở kho khác, đang cho
          thuê, hoặc chưa có trong CRM). Sửa hàng loạt serial, biến thể, bảo hành thì dùng{" "}
          <Link href="/equipment/stocktake" className="underline">
            Kiểm kho bằng bảng tính
          </Link>
          .
        </p>
      </div>
      <ScanClient
        branches={branches ?? []}
        categories={categories ?? []}
        lockedBranchId={employee.role === "cua_hang_truong" ? employee.branch_id : null}
        canMove={MANAGE_ROLES.includes(employee.role)}
      />
    </div>
  );
}
