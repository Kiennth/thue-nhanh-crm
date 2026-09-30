-- Ghi chú hiển thị cho MỌI dòng hàng, học Booqable "extra information" (CEO
-- 2026-09-30): team quen ghi "Kèm Remote | Dây nguồn" dưới dòng thiết bị và
-- địa chỉ + SĐT dưới dòng phí giao/thu hồi. Tách khỏi cột `note` cũ vì `note`
-- đang chứa ghi chú NỘI BỘ (lịch sử gắn lại dòng tự do, đổi món combo) không
-- được in ra cho khách. `note` giữ nguyên làm nhật ký nội bộ.
alter table public.order_equipment add column extra_information text;

-- Ghi chú mặc định theo sản phẩm (vd TV: "Kèm Remote | Dây nguồn") — thêm
-- dòng vào đơn thì tự điền, sửa được trên từng đơn.
alter table public.equipment_types add column default_extra_information text;

-- Địa chỉ + SĐT đã ghi trên 4 dòng phí giao/thu hồi (trước nằm ở `note`)
-- chuyển sang trường mới; bỏ qua ghi chú nội bộ của mapper/combo.
update public.order_equipment
set extra_information = note
where equipment_type_id in (
    '38f5c644-3898-4b1f-a3f5-901e55f77c6a',
    '13c85fe0-8b13-4d76-9df5-a20b19598cc9',
    'ce4a5f88-8daa-47c2-92fc-196d1fc321db',
    '1a53924a-a070-44b0-9441-3f09042af7e7'
  )
  and note is not null
  and note not like 'Gắn lại từ dòng tự do%'
  and note not like 'Đổi món combo%';
