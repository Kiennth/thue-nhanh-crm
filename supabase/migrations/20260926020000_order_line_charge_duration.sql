-- Số kỳ tính tiền riêng từng dòng (CEO 2026-09-26, học Booqable "charge
-- length"): khách cầm 5 ngày nhưng chỉ tính 3 ngày. null = tự tính theo thời
-- gian thuê của đơn như trước; có số thì giá dòng = giá gốc × số kỳ này (bậc
-- giảm giá gói cũng xét theo số kỳ này). Đơn vị = rental_period_unit của sản
-- phẩm (ngày/giờ/tuần...). Thời gian thuê của đơn (giữ hàng, trùng lịch) giữ
-- nguyên.
alter table public.order_equipment
  add column charge_duration numeric(8, 2) check (charge_duration > 0);
