-- CEO 2026-08-03: rà soát toàn bộ dòng đơn hàng đang lưu dạng tự do
-- (custom_name, không gắn equipment_type_id) — phần lớn là SKU Booqable
-- không khớp được sản phẩm nào lúc import. Gắn lại 15 tên khớp ngay với
-- sản phẩm hiện có trong danh mục (chỉ lệch chính tả/dấu câu, đã CEO xác
-- nhận từng cặp), tổng 64 dòng.
--
-- 2 sản phẩm đích chưa có biến thể/serial nào trong danh mục lúc rà soát:
--   - "PC Core i7 12th | 32GB RAM | RTX 3060" (theo số lượng) — tạo biến
--     thể mặc định trùng tên sản phẩm.
--   - 4 sản phẩm theo dõi riêng lẻ (MacBook Pro 16" M1 Max 64GB RAM,
--     iPad Mini 6 8.3-inch, Màn hình tương tác 50-inch, DJI Mic 2) — CEO
--     xác nhận tạo serial tạm (mã rõ ràng là tạm, không phải serial thật)
--     để gắn ngay, giống cách đã làm với các SKU cũ trước đây.
--
-- Giữ nguyên unit_price/line_total/quantity của mọi dòng.
do $$
declare
  v_pc_unit_id uuid;
  v_mbp_inst_id uuid;
  v_ipadmini_inst_id uuid;
  v_manhinh_inst_id uuid;
  v_djimic_inst_id uuid;
begin
  insert into public.equipment_units (equipment_type_id, brand_model)
  values ('22986677-634a-4789-8369-2b8d93c28b27', 'PC Core i7 12th | 32GB RAM | RTX 3060')
  returning id into v_pc_unit_id;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values ('4e358877-6880-40bb-98df-94ee2e864dc5', 'MBPM1MAX16-01', 'available')
  returning id into v_mbp_inst_id;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values ('fe035376-6210-479e-b6b9-e7abbcdeb92e', 'IPADMINI6-01', 'available')
  returning id into v_ipadmini_inst_id;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values ('847db96e-573e-4aa6-8ee4-555fe89245e4', 'MANHINH50-01', 'available')
  returning id into v_manhinh_inst_id;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values ('25e951fa-eddd-40c1-8a09-449fdad1658c', 'DJIMIC2-01', 'available')
  returning id into v_djimic_inst_id;

  update public.order_equipment set equipment_type_id = '4e358877-6880-40bb-98df-94ee2e864dc5', custom_name = null, equipment_instance_id = v_mbp_inst_id
    where custom_name = 'MacBook Pro 16 inch M1 MAX 64GB RAM';
  update public.order_equipment set equipment_type_id = 'e676e154-01d0-4abd-bbdd-195b01a6e5ae', custom_name = null, equipment_unit_id = '6d283e22-d789-48a6-b45b-6c7d30e18880'
    where custom_name = '[KHÔNG DÙNG] MacBook Pro M1 PRO 16GB 512GB 16-inch';
  update public.order_equipment set equipment_type_id = '22986677-634a-4789-8369-2b8d93c28b27', custom_name = null, equipment_unit_id = v_pc_unit_id
    where custom_name = 'PC Core i7 12th 32GB RAM RTX 3060';
  update public.order_equipment set equipment_type_id = 'f816cca8-8600-4cc8-93b2-046c863a6979', custom_name = null, equipment_unit_id = '1787b7ff-9d1d-4110-b6dd-e7a71cd0f1fa'
    where custom_name = 'Smart TV 4K 50-inch [TRACK ID] - CASPER';
  update public.order_equipment set equipment_type_id = 'fe035376-6210-479e-b6b9-e7abbcdeb92e', custom_name = null, equipment_instance_id = v_ipadmini_inst_id
    where custom_name = 'iPad Mini 6 8.3 inch';
  update public.order_equipment set equipment_type_id = '847db96e-573e-4aa6-8ee4-555fe89245e4', custom_name = null, equipment_instance_id = v_manhinh_inst_id
    where custom_name = 'Màn hình tương tác 50 inch';
  update public.order_equipment set equipment_type_id = 'cacd24d8-545a-4395-8254-2c9f9ef2be9b', custom_name = null, equipment_unit_id = 'e1c39d18-37b3-408f-b676-e4d7730b1762'
    where custom_name = 'Máy tính bảng Samsung Galaxy Tab A7 Lite';
  update public.order_equipment set equipment_type_id = '73ba754b-4a87-4d30-bfd4-15fb03fe5017', custom_name = null, equipment_unit_id = '18a2b799-839b-4bcd-bccd-5965959dfebe'
    where custom_name = '[EOL] iPhone 11';
  update public.order_equipment set equipment_type_id = '5c0e4a96-38e4-4925-b7b6-331409e70d54', custom_name = null
    where custom_name = 'Phí dịch vụ hỗ trợ kỹ thuật| On site support';
  update public.order_equipment set equipment_type_id = 'e4e870f4-3269-4e55-a5ec-1c7df7c6914b', custom_name = null, equipment_unit_id = '01b0d02c-3d67-4121-9994-bcd6a613e687'
    where custom_name in ('Combo Chuột Phím Có Dây', 'Combo chuột + phím có dây');
  update public.order_equipment set equipment_type_id = 'd083f553-8797-4733-bd5f-8219646e60bc', custom_name = null, equipment_unit_id = 'f7908046-ea26-4e1b-87b8-6b7fb48ff0ea'
    where custom_name = 'dây HDMI to HDMI 4K 5m';
  update public.order_equipment set equipment_type_id = 'ae7d9512-455c-480e-bfe0-09fb418ba1b0', custom_name = null, equipment_unit_id = '7a5a873b-540a-497c-9043-72b6ed3e54e0'
    where custom_name = '[KHÔNG DÙNG MÃ NÀY] Apple TV 1080p';
  update public.order_equipment set equipment_type_id = '863a230b-c1b1-4e30-a8b5-eff26a5b963b', custom_name = null, equipment_unit_id = '1627a206-f277-431a-a77d-a9a6b9ccc876'
    where custom_name = 'Giá đỡ iPad';
  update public.order_equipment set equipment_type_id = '25e951fa-eddd-40c1-8a09-449fdad1658c', custom_name = null, equipment_instance_id = v_djimic_inst_id
    where custom_name = 'DJI Mic 2 ( thêm 1 mic, miễn phí)';
end $$;
