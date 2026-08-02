-- CEO rà soát toàn bộ 182 loại hàng đang tracking_type='individual'
-- (2026-08-02): 179 loại giữ nguyên individual (đa số chưa có máy thật gắn
-- vào — sẽ tạo dần khi nhập kho; xem note trong 20260802020000 cho auto-tạo
-- biến thể mặc định). Chỉ 3 loại tay cầm rời sau đây thật sự nên chuyển
-- quantity: phụ kiện rẻ, thay thế được, không cần biết đúng cái nào ở khách
-- nào — khác hẳn console chính (PS5, Switch, Xbox...) hay mic/loa vẫn giữ
-- individual vì dễ thất lạc/giá trị cao hơn.
update public.equipment_types
set tracking_type = 'quantity'
where name in (
  'Sony Dualsense Controller',
  'Sony DualShock Controller',
  'Microsoft Xbox Wireless Controller'
)
and tracking_type = 'individual';
