import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Cảnh báo trùng lịch thiết bị (CEO 2026-08-09) — tồn kho chỉ trừ lúc GIAO
// nên các đơn tương lai có thể hứa trùng một món hàng. Server component tự
// gọi RPC order_schedule_conflicts mỗi lần trang render (mọi lần thêm dòng/
// đổi ngày đều revalidate trang này nên cảnh báo luôn tươi). CHỈ cảnh báo,
// không chặn lưu — có lúc cố tình nhận vượt kho rồi điều hàng về kịp.
export async function OrderConflictAlert({ orderId }: { orderId: string }) {
  const supabase = await createClient();
  const { data: conflicts, error } = await supabase.rpc("order_schedule_conflicts", {
    p_order_id: orderId,
  });

  // Lỗi RPC không được làm gãy trang chi tiết đơn — âm thầm bỏ cảnh báo.
  if (error || !conflicts?.length) return null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        Trùng lịch thiết bị — kho không đủ cho các đơn đang hẹn cùng khoảng thuê
      </p>
      <ul className="mt-2 space-y-2">
        {conflicts.map((c) => {
          const shortage = c.my_quantity + c.others_quantity - c.capacity;
          return (
            <li key={c.equipment_type_id} className="text-sm">
              <p>
                <span className="font-medium">{c.equipment_type_name}</span>: đơn này cần{" "}
                {c.my_quantity}, các đơn khác giữ {c.others_quantity}, kho toàn công ty có{" "}
                {c.capacity} → <span className="font-semibold text-destructive">thiếu {shortage}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Đơn trùng khoảng thuê:{" "}
                {c.conflicting_orders.map((o, idx) => (
                  <span key={o.orderId}>
                    {idx > 0 && ", "}
                    <Link
                      href={`/orders/${o.orderId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {o.orderCode}
                    </Link>{" "}
                    (giữ {o.quantity} · {dateTimeFormatter.format(new Date(o.rentalStartAt))} →{" "}
                    {dateTimeFormatter.format(new Date(o.rentalEndAt))})
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Xử lý: giảm số lượng, đổi khoảng thuê, hoặc chuyển kho bổ sung từ chi nhánh khác trước
        ngày giao. Cảnh báo không chặn lưu đơn.
      </p>
    </div>
  );
}
