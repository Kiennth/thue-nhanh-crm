-- CEO 2026-08-03: đơn BQ11433 (Booqable #11433) đã có sẵn trong CRM từ
-- đợt import trước — customer/ngày/giá khớp chính xác Booqable — nhưng
-- dòng thiết bị "Màn hình tương tác 86-inch 4K" không khớp được sản phẩm
-- nào lúc import nên bị lưu thành dòng tự do. Gắn lại vào "Màn hình
-- tương tác 86-inch" (đã có sẵn serial thật TOUCH-86-SG-01).
update public.order_equipment
set equipment_type_id = '46afc75a-88f0-460f-a1b8-78b26ad62cda',
    custom_name = null,
    equipment_instance_id = '2726ecb3-790e-4849-aac8-4e638885be43'
where id = '6838cf35-56d6-4323-9aa5-165e05d50812';
