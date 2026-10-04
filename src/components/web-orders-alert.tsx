import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Thanh báo "có N đơn web mới" (CEO 2026-10-04) — trang chủ + trang Đơn
// hàng, để nhân viên trực thấy ngay yêu cầu đặt thuê từ giỏ hàng web.
export async function WebOrdersAlert() {
  const supabase = await createClient();
  // website_orders chưa có trong types/database.ts — client không ràng kiểu.
  const { count } = await (supabase as unknown as SupabaseClient)
    .from("website_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (!count) return null;
  return (
    <Link
      href="/orders/web"
      className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/15"
    >
      <Globe className="size-4 shrink-0" />
      Có {count} đơn web mới khách gửi từ thuenhanh.vn — bấm để xem và lên đơn →
    </Link>
  );
}
