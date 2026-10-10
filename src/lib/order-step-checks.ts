import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Cảnh báo khi chốt khâu (Grok tách gọn CRM 10/10 giai đoạn 3) — CẢNH BÁO có
// lý do, không chặn. Cùng cách tính với trang chi tiết đơn:
//  - Còn nợ = tổng gồm VAT − các khoản thanh toán HOÁ ĐƠN (cọc là tiền giữ hộ);
//  - Cọc chưa thu = cọc theo hàng × % cọc của khách (làm tròn 100.000đ) hoặc
//    số sửa tay, trừ phần đã thu; đã hoàn cọc thì coi như xong.
//  - Thiếu CCCD: khách cá nhân chưa có số CCCD (chỉ nhắc).
export interface OrderStepChecks {
  remaining: number;
  depositDue: number;
  missingCccd: boolean;
  hasOwingOverride: boolean;
}

export async function getOrderStepChecks(supabase: Supabase, orderId: string): Promise<OrderStepChecks> {
  const [{ data: order }, { data: lines }, { data: payments }, { data: overrides }] = await Promise.all([
    supabase
      .from("orders")
      .select("total_value, deposit_override_amount, customers(customer_type, tax_code, deposit_percentage)")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_equipment")
      .select("quantity, equipment_types(product_type, tracking_type, deposit_amount)")
      .eq("order_id", orderId),
    supabase.from("order_payments").select("payment_type, amount").eq("order_id", orderId),
    (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("step_overrides")
      .select("id")
      .eq("order_id", orderId)
      .eq("rule", "owing")
      .limit(1),
  ]);
  if (!order) return { remaining: 0, depositDue: 0, missingCccd: false, hasOwingOverride: false };
  const customer = order.customers as unknown as {
    customer_type: string;
    tax_code: string | null;
    deposit_percentage: number | null;
  } | null;
  const grandTotal = Math.round(order.total_value * 1.08);
  const sum = (type: string) =>
    (payments ?? []).filter((p) => p.payment_type === type).reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, grandTotal - sum("invoice"));
  const rawDeposit = (lines ?? []).reduce((s, l) => {
    const t = l.equipment_types as unknown as { product_type: string; tracking_type: string | null; deposit_amount: number | null } | null;
    if (t?.product_type !== "rental" || t.tracking_type === "combo") return s;
    return s + (t.deposit_amount ?? 0) * l.quantity;
  }, 0);
  const totalDeposit =
    order.deposit_override_amount != null
      ? Number(order.deposit_override_amount)
      : Math.round((rawDeposit * (customer?.deposit_percentage ?? 100)) / 100 / 100_000) * 100_000;
  const refunded = sum("deposit_refund");
  const depositDue = totalDeposit > 0 && refunded === 0 ? Math.max(0, totalDeposit - sum("deposit_collect")) : 0;
  return {
    remaining,
    depositDue,
    missingCccd: customer?.customer_type === "individual" && !customer.tax_code,
    hasOwingOverride: !!overrides?.length,
  };
}
