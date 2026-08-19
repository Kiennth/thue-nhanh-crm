-- Chuyển "Cục phát 5G WiFi 6 (có pin, kèm sim 5G)" + "Cục phát 5G WiFi 7
-- (có pin, kèm sim 5G)" sang theo dõi serial (CEO 2026-08-19). Đã áp qua
-- REST service-role; file này là sổ sách. Đối chiếu Booqable trước khi
-- làm (kho CRM cũ là số ảo, không phải tồn thật):
--
--   * "Cục phát 5G WiFi 6 (có pin, kèm sim 5G)" 26dc424c… — CRM ghi 30
--     (10/10/10), Booqable thật GALAXY-SCR01: DN 1 + HN 3 + HCM 9 = 13.
--     144 dòng đơn (17 dòng qty>1 tách trước), 5 dòng đang mở gán mỗi
--     dòng 1 máy riêng (không trùng), 139 dòng lịch sử round-robin 13 máy.
--   * "Cục phát 5G WiFi 7 (có pin, kèm sim 5G)" 90207e0d… — CRM ghi 28
--     (10/8/10), Booqable thật: HCM 3 (2 in stock + 1 đang cho thuê),
--     HN/DN 0. 7 dòng đơn, 2 dòng đang mở gán 2 máy riêng, 5 dòng lịch sử
--     round-robin 3 máy.
--
-- Giá/cọc giữ nguyên cả hai (300k/500k và 400k/1tr) — không đơn mở nào bị
-- đụng cọc. Serial mang mã tạm AUTO-WIFI6-PIN-*/AUTO-WIFI7-PIN-*, CEO thay
-- serial thật khi rảnh.

update public.equipment_types set tracking_type = 'individual'
where id in ('26dc424c-f8d5-43de-a8c3-7780c88317dd', '90207e0d-f840-4bbf-9911-1b36099eaebb');
