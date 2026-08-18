-- Gom 2 SKU JBL Partybox 710 + chuyển theo serial (CEO 2026-08-19).
-- Đã áp qua REST service-role; file này là sổ sách.
--
-- Hiện trạng lúc áp:
--   "Loa JBL Partybox 710" 8254187d (individual, 1tr/cọc 5tr): VỎ RỖNG —
--     0 unit/instance/dòng; web row đẹp thue-loa-jbl-partybox-710 (mô tả
--     657 ký tự + 4 ảnh) → XOÁ type, GIỮ web row.
--   "Loa di động JBL Partybox 710 800W" 5f829974 (quantity, cùng giá/cọc):
--     hàng thật — 27 dòng (6 dòng qty>1), kho CRM 10/10/10 là số ẢO hồi
--     import; kho thật theo Booqable: HN 1 + HCM 3. Không đơn mở.
--
-- Việc đã làm trên 5f829974:
--   1. Tách 6 dòng qty>1 → tổng 34 dòng qty=1, line_total giữ nguyên
--      (kiểm tổng 40.8tr).
--   2. Đổi tên → "Loa JBL Partybox 710", tracking quantity → individual
--      (giá/cọc y hệt → không đóng băng gì).
--   3. Tạo 4 instance AUTO-PARTYBOX-710-* theo kho THẬT Booqable
--      (HN 1 + HCM 3) — bỏ số ảo 30.
--   4. 34 dòng (đều đã đóng) gán round-robin 4 instance.
--   5. Web: xoá row rỗng thue-loa-di-dong-jbl-partybox-710-800w, trỏ row
--      đẹp của vỏ sang 5f829974 rồi xoá vỏ. Redirect seed-data vá id.
--
-- CEO thay mã AUTO-* bằng serial thật khi rảnh.

update public.equipment_types
set name = 'Loa JBL Partybox 710', tracking_type = 'individual'
where id = '5f829974-60aa-4660-b4fd-71f91fe5e418';

-- ---------------------------------------------------------------------------
-- CÙNG NGÀY (CEO 2026-08-19, các lệnh tiếp theo):
--   * "Màn Hình UWQHD 34-inch - LC34G55TWWEXXV": web row chuyển danh mục
--     Màn Hình → Gaming LCD (sản phẩm đã có sẵn trong CRM).
--   * Tạo "Ghế massage" 94b732ff… từ Booqable (800k/ngày, cọc 1tr, template
--     88a44846): 2 unit theo 2 variation Booqable — Fuji Luxury CZ916 (kho
--     HCM 4) + Kingsport (kho HCM 1); ảnh Booqable vào bucket; nối 15 dòng
--     mồ côi đúng theo mẫu ghi trong custom_name (11 Fuji + 4 Kingsport,
--     đơn đều đã đóng); web thue-ghe-massage published, danh mục Thiết Bị
--     Vật Lý Trị Liệu.
