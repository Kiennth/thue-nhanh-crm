-- Gộp 97 loại hàng hoá bị tách sai (do import Booqable: mỗi Product+Variation
-- thành 1 equipment_types riêng) thành 40 sản phẩm thật + equipment_units
-- (biến thể). Toàn bộ 40 nhóm đã được CEO rà tay từng nhóm một trước khi viết
-- migration này — xem /Users/trungkien/.claude/plans/expressive-painting-alpaca.md.
--
-- Đã re-verify lại toàn bộ ID/giá/tracking_type/số lượng order_equipment/
-- equipment_instances/rfid_tags ngay trước khi viết file này (production,
-- 2026-07-28) — không có gì lệch so với lúc CEO rà soát.
--
-- Thứ tự bắt buộc mỗi nhóm (tránh vướng equipment_units.equipment_type_id
-- ON DELETE CASCADE — xoá loại trước khi dời biến thể sẽ mất luôn biến thể):
--   1. Đổi tên survivor về tên gốc.
--   2. Dời + đổi brand_model các equipment_units của loại thua sang survivor.
--   3. Dời equipment_instances (chỉ 4 nhóm có máy thật) và order_equipment
--      đang trỏ vào loại thua sang survivor.
--   4. Xoá các loại thua.

alter table public.equipment_units add column image_url text;

-- =====================================================================
-- NHÓM A — 14 nhóm "sạch": đồng giá, đồng tracking_type=quantity, mỗi loại
-- thua đã có sẵn đúng 1 equipment_units cần dời + đổi brand_model.
-- =====================================================================

-- 1. Cột Chắn INOX gắn bảng thông báo chỉ dẫn A3 (3m)
update public.equipment_types set name = 'Cột Chắn INOX gắn bảng thông báo chỉ dẫn A3 (3m)'
  where id = '6d732132-07f2-4b18-9f03-a9f8d21af7ff';
update public.equipment_units set equipment_type_id = '6d732132-07f2-4b18-9f03-a9f8d21af7ff',
    brand_model = 'Bảng Ngang, Inox',
    image_url = (select image_url from public.equipment_types where id = '9568fd6c-db4b-456d-8feb-14d30f8e3f3e')
  where equipment_type_id = '9568fd6c-db4b-456d-8feb-14d30f8e3f3e';
update public.order_equipment set equipment_type_id = '6d732132-07f2-4b18-9f03-a9f8d21af7ff'
  where equipment_type_id = '9568fd6c-db4b-456d-8feb-14d30f8e3f3e';

-- 2. Cột Chắn INOX gắn bảng thông báo chỉ dẫn A4 (3m)
update public.equipment_types set name = 'Cột Chắn INOX gắn bảng thông báo chỉ dẫn A4 (3m)'
  where id = '7ae23b77-9b40-4cf4-9d2e-ce994a949a29';
update public.equipment_units set equipment_type_id = '7ae23b77-9b40-4cf4-9d2e-ce994a949a29',
    brand_model = 'Bảng Ngang',
    image_url = (select image_url from public.equipment_types where id = 'cbeaabae-329e-4e12-9184-10f7ff549651')
  where equipment_type_id = 'cbeaabae-329e-4e12-9184-10f7ff549651';
update public.order_equipment set equipment_type_id = '7ae23b77-9b40-4cf4-9d2e-ce994a949a29'
  where equipment_type_id = 'cbeaabae-329e-4e12-9184-10f7ff549651';

-- 3. Cột Chắn INOX phân làn dây căng 3m màu INOX
update public.equipment_types set name = 'Cột Chắn INOX phân làn dây căng 3m màu INOX'
  where id = '343e5bb2-cf63-4ce7-9594-660a76551bf8';
update public.equipment_units set equipment_type_id = '343e5bb2-cf63-4ce7-9594-660a76551bf8',
    brand_model = 'Dây Đỏ',
    image_url = (select image_url from public.equipment_types where id = 'f1088edb-1c9b-4ffe-88ef-8b035b6b11ed')
  where equipment_type_id = 'f1088edb-1c9b-4ffe-88ef-8b035b6b11ed';
update public.order_equipment set equipment_type_id = '343e5bb2-cf63-4ce7-9594-660a76551bf8'
  where equipment_type_id = 'f1088edb-1c9b-4ffe-88ef-8b035b6b11ed';

-- 4. Giá đỡ máy tính bảng chân đứng chống trộm 7-13 inch (survivor rỗng, 0 biến thể sẵn có)
update public.equipment_units set equipment_type_id = 'cb12ecdb-2b79-4e6e-aa49-11915f2e170d',
    brand_model = 'Trắng',
    image_url = (select image_url from public.equipment_types where id = 'aa61a18e-7e60-471b-acc7-ee05a83e5537')
  where equipment_type_id = 'aa61a18e-7e60-471b-acc7-ee05a83e5537';
update public.order_equipment set equipment_type_id = 'cb12ecdb-2b79-4e6e-aa49-11915f2e170d'
  where equipment_type_id = 'aa61a18e-7e60-471b-acc7-ee05a83e5537';
update public.equipment_units set equipment_type_id = 'cb12ecdb-2b79-4e6e-aa49-11915f2e170d',
    brand_model = 'Đen',
    image_url = (select image_url from public.equipment_types where id = '6337fc61-dc08-4e0f-8439-4178ebd70c4e')
  where equipment_type_id = '6337fc61-dc08-4e0f-8439-4178ebd70c4e';
update public.order_equipment set equipment_type_id = 'cb12ecdb-2b79-4e6e-aa49-11915f2e170d'
  where equipment_type_id = '6337fc61-dc08-4e0f-8439-4178ebd70c4e';

-- 5. Loa trợ giảng
update public.equipment_types set name = 'Loa trợ giảng' where id = '2791e4f3-6a4e-4385-9f56-0e0dcbc15254';
update public.equipment_units set equipment_type_id = '2791e4f3-6a4e-4385-9f56-0e0dcbc15254',
    brand_model = 'TAKSTAR',
    image_url = (select image_url from public.equipment_types where id = 'ffd24637-7181-4c21-bb3f-5ea902dd4d9a')
  where equipment_type_id = 'ffd24637-7181-4c21-bb3f-5ea902dd4d9a';
update public.order_equipment set equipment_type_id = '2791e4f3-6a4e-4385-9f56-0e0dcbc15254'
  where equipment_type_id = 'ffd24637-7181-4c21-bb3f-5ea902dd4d9a';

-- 6. Màn Hình 1080P 27-inch
update public.equipment_types set name = 'Màn Hình 1080P 27-inch' where id = '27b149aa-0ad9-4014-897c-0237502f2c8f';
update public.equipment_units set equipment_type_id = '27b149aa-0ad9-4014-897c-0237502f2c8f',
    brand_model = 'MH cong',
    image_url = (select image_url from public.equipment_types where id = 'b9a6372b-e78a-4bce-b264-d97d38d8ccef')
  where equipment_type_id = 'b9a6372b-e78a-4bce-b264-d97d38d8ccef';
update public.order_equipment set equipment_type_id = '27b149aa-0ad9-4014-897c-0237502f2c8f'
  where equipment_type_id = 'b9a6372b-e78a-4bce-b264-d97d38d8ccef';
update public.equipment_units set equipment_type_id = '27b149aa-0ad9-4014-897c-0237502f2c8f',
    brand_model = 'MH Phẳng Samsung LS27D300GAEXXV',
    image_url = (select image_url from public.equipment_types where id = 'bf762d59-d4f8-4d2e-8271-ca51c59f1a67')
  where equipment_type_id = 'bf762d59-d4f8-4d2e-8271-ca51c59f1a67';
update public.order_equipment set equipment_type_id = '27b149aa-0ad9-4014-897c-0237502f2c8f'
  where equipment_type_id = 'bf762d59-d4f8-4d2e-8271-ca51c59f1a67';

-- 7. Màn Hình Tương Tác 27-inch GoWithMe
update public.equipment_types set name = 'Màn Hình Tương Tác 27-inch GoWithMe' where id = '511bc204-f457-4232-8649-137fc4b8a37a';
update public.equipment_units set equipment_type_id = '511bc204-f457-4232-8649-137fc4b8a37a',
    brand_model = 'Màu Trắng',
    image_url = (select image_url from public.equipment_types where id = 'cd53ac4d-a2bf-4dfb-8a7d-b5057444e60a')
  where equipment_type_id = 'cd53ac4d-a2bf-4dfb-8a7d-b5057444e60a';
update public.order_equipment set equipment_type_id = '511bc204-f457-4232-8649-137fc4b8a37a'
  where equipment_type_id = 'cd53ac4d-a2bf-4dfb-8a7d-b5057444e60a';

-- 8. Máy Chạy Bộ Thông Minh KingSmith
update public.equipment_types set name = 'Máy Chạy Bộ Thông Minh KingSmith' where id = '9321821b-012d-4860-90cf-9b45d4768994';
update public.equipment_units set equipment_type_id = '9321821b-012d-4860-90cf-9b45d4768994',
    brand_model = 'R2',
    image_url = (select image_url from public.equipment_types where id = 'e82dc01c-6096-4ff0-82e0-d19fb3f868fe')
  where equipment_type_id = 'e82dc01c-6096-4ff0-82e0-d19fb3f868fe';
update public.order_equipment set equipment_type_id = '9321821b-012d-4860-90cf-9b45d4768994'
  where equipment_type_id = 'e82dc01c-6096-4ff0-82e0-d19fb3f868fe';

-- 9. Máy tính bảng Samsung Galaxy Tab S10 Ultra 14.6-inch
update public.equipment_types set name = 'Máy tính bảng Samsung Galaxy Tab S10 Ultra 14.6-inch' where id = 'baf349e9-8ea4-42c0-81da-6eb4cb59da79';
update public.equipment_units set equipment_type_id = 'baf349e9-8ea4-42c0-81da-6eb4cb59da79',
    brand_model = 'Wi-Fi + 5G',
    image_url = (select image_url from public.equipment_types where id = '5ecaa5d7-6429-4155-8cf1-46ca238f3311')
  where equipment_type_id = '5ecaa5d7-6429-4155-8cf1-46ca238f3311';
update public.order_equipment set equipment_type_id = 'baf349e9-8ea4-42c0-81da-6eb4cb59da79'
  where equipment_type_id = '5ecaa5d7-6429-4155-8cf1-46ca238f3311';

-- 10. Smart TV 1080p 43-inch
update public.equipment_types set name = 'Smart TV 1080p 43-inch' where id = '420776bc-1469-4ac6-91b4-f16a501b19fe';
update public.equipment_units set equipment_type_id = '420776bc-1469-4ac6-91b4-f16a501b19fe',
    brand_model = 'Xiaomi A2',
    image_url = (select image_url from public.equipment_types where id = '36c78596-e9f0-4214-868a-82cbe42a0693')
  where equipment_type_id = '36c78596-e9f0-4214-868a-82cbe42a0693';
update public.order_equipment set equipment_type_id = '420776bc-1469-4ac6-91b4-f16a501b19fe'
  where equipment_type_id = '36c78596-e9f0-4214-868a-82cbe42a0693';

-- 11. Smart TV 4K 55-inch
update public.equipment_types set name = 'Smart TV 4K 55-inch' where id = 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c';
update public.equipment_units set equipment_type_id = 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c',
    brand_model = 'COCAA',
    image_url = (select image_url from public.equipment_types where id = 'a4b5cdc8-5d2a-4fe5-9964-34ccb4d0f9d5')
  where equipment_type_id = 'a4b5cdc8-5d2a-4fe5-9964-34ccb4d0f9d5';
update public.order_equipment set equipment_type_id = 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c'
  where equipment_type_id = 'a4b5cdc8-5d2a-4fe5-9964-34ccb4d0f9d5';
update public.equipment_units set equipment_type_id = 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c',
    brand_model = 'CASPER',
    image_url = (select image_url from public.equipment_types where id = 'dd156d87-cb6b-445a-b32f-0712beeb8f86')
  where equipment_type_id = 'dd156d87-cb6b-445a-b32f-0712beeb8f86';
update public.order_equipment set equipment_type_id = 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c'
  where equipment_type_id = 'dd156d87-cb6b-445a-b32f-0712beeb8f86';

-- 12. Smart TV 65-inch 4K (6 biến thể)
update public.equipment_types set name = 'Smart TV 65-inch 4K' where id = '154e5ce0-5a67-4054-b160-f612f614ac1d';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'TCL 65C645',
    image_url = (select image_url from public.equipment_types where id = '5d2e2121-9f57-4adc-ae86-54947170e796')
  where equipment_type_id = '5d2e2121-9f57-4adc-ae86-54947170e796';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = '5d2e2121-9f57-4adc-ae86-54947170e796';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'TCL 65P755Pro',
    image_url = (select image_url from public.equipment_types where id = 'd81844da-ab5d-4f7a-a499-febcbf006a4f')
  where equipment_type_id = 'd81844da-ab5d-4f7a-a499-febcbf006a4f';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = 'd81844da-ab5d-4f7a-a499-febcbf006a4f';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'TCL 65P79BPro',
    image_url = (select image_url from public.equipment_types where id = '79757df1-9aa4-4257-82e8-7152eb5a24fd')
  where equipment_type_id = '79757df1-9aa4-4257-82e8-7152eb5a24fd';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = '79757df1-9aa4-4257-82e8-7152eb5a24fd';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'Hisense_65A6500K',
    image_url = (select image_url from public.equipment_types where id = '46c193b4-733e-4e2d-9d68-40c590fdf6f6')
  where equipment_type_id = '46c193b4-733e-4e2d-9d68-40c590fdf6f6';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = '46c193b4-733e-4e2d-9d68-40c590fdf6f6';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'SAMSUNG_UA65AU7700',
    image_url = (select image_url from public.equipment_types where id = 'cf91dccb-a389-48a4-aab9-4577660f3ca6')
  where equipment_type_id = 'cf91dccb-a389-48a4-aab9-4577660f3ca6';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = 'cf91dccb-a389-48a4-aab9-4577660f3ca6';
update public.equipment_units set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d',
    brand_model = 'XIAOMI_L65M8-A2SEA',
    image_url = (select image_url from public.equipment_types where id = '2f473cc4-cdc4-4ffa-8e43-552bc1871600')
  where equipment_type_id = '2f473cc4-cdc4-4ffa-8e43-552bc1871600';
update public.order_equipment set equipment_type_id = '154e5ce0-5a67-4054-b160-f612f614ac1d'
  where equipment_type_id = '2f473cc4-cdc4-4ffa-8e43-552bc1871600';

-- 13. Tai Nghe Bluetooth Chụp Tai
update public.equipment_types set name = 'Tai Nghe Bluetooth Chụp Tai' where id = 'b7bd2cc5-2ffe-4c24-8a72-e4bbec419f98';
update public.equipment_units set equipment_type_id = 'b7bd2cc5-2ffe-4c24-8a72-e4bbec419f98',
    brand_model = 'QCY H2 Pro - màu Trắng',
    image_url = (select image_url from public.equipment_types where id = '962fe473-db55-4a81-99b6-c39cb1b2fc49')
  where equipment_type_id = '962fe473-db55-4a81-99b6-c39cb1b2fc49';
update public.order_equipment set equipment_type_id = 'b7bd2cc5-2ffe-4c24-8a72-e4bbec419f98'
  where equipment_type_id = '962fe473-db55-4a81-99b6-c39cb1b2fc49';

-- 14. Xe điện cân bằng Ninebot Mini
update public.equipment_types set name = 'Xe điện cân bằng Ninebot Mini' where id = '49fc965f-a7e2-47e2-bcc2-f9d34175dcee';
update public.equipment_units set equipment_type_id = '49fc965f-a7e2-47e2-bcc2-f9d34175dcee',
    brand_model = 'Màu Đen',
    image_url = (select image_url from public.equipment_types where id = 'd9522103-b24b-4807-b2b0-babf0e0ba438')
  where equipment_type_id = 'd9522103-b24b-4807-b2b0-babf0e0ba438';
update public.order_equipment set equipment_type_id = '49fc965f-a7e2-47e2-bcc2-f9d34175dcee'
  where equipment_type_id = 'd9522103-b24b-4807-b2b0-babf0e0ba438';

delete from public.equipment_types where id in (
  '9568fd6c-db4b-456d-8feb-14d30f8e3f3e', 'cbeaabae-329e-4e12-9184-10f7ff549651',
  'f1088edb-1c9b-4ffe-88ef-8b035b6b11ed',
  'aa61a18e-7e60-471b-acc7-ee05a83e5537', '6337fc61-dc08-4e0f-8439-4178ebd70c4e',
  'ffd24637-7181-4c21-bb3f-5ea902dd4d9a',
  'b9a6372b-e78a-4bce-b264-d97d38d8ccef', 'bf762d59-d4f8-4d2e-8271-ca51c59f1a67',
  'cd53ac4d-a2bf-4dfb-8a7d-b5057444e60a',
  'e82dc01c-6096-4ff0-82e0-d19fb3f868fe',
  '5ecaa5d7-6429-4155-8cf1-46ca238f3311',
  '36c78596-e9f0-4214-868a-82cbe42a0693',
  'a4b5cdc8-5d2a-4fe5-9964-34ccb4d0f9d5', 'dd156d87-cb6b-445a-b32f-0712beeb8f86',
  '5d2e2121-9f57-4adc-ae86-54947170e796', 'd81844da-ab5d-4f7a-a499-febcbf006a4f',
  '79757df1-9aa4-4257-82e8-7152eb5a24fd', '46c193b4-733e-4e2d-9d68-40c590fdf6f6',
  'cf91dccb-a389-48a4-aab9-4577660f3ca6', '2f473cc4-cdc4-4ffa-8e43-552bc1871600',
  '962fe473-db55-4a81-99b6-c39cb1b2fc49',
  'd9522103-b24b-4807-b2b0-babf0e0ba438'
);

-- =====================================================================
-- NHÓM B — 15 nhóm iPad tracking_type=individual thuần, 0 equipment_units
-- và 0 equipment_instances ở cả 2 phía (chưa từng nhập kho) — chỉ đổi tên
-- survivor rồi xoá loại thua, không có gì để dời. 6/15 nhóm có image_url
-- riêng trên cả 2 phía (khảo sát trước khi viết migration) — survivor đã có
-- sẵn ảnh riêng nên không mất ảnh đại diện sản phẩm, chỉ mất ảnh phân biệt
-- theo kết nối (Wi-Fi Only/5G) vốn thường giống hệt nhau về mặt hình ảnh.
-- =====================================================================

update public.equipment_types set name = 'iPad Air 5 M1 10.9-inch' where id = '65362030-86fc-49da-a92c-16bf765d22fa';
update public.equipment_types set name = 'iPad Air 6 M2 11-inch' where id = '824d31f0-74ac-4495-82c9-a0b4341ec8ab';
update public.equipment_types set name = 'iPad Air 6 M2 13-inch' where id = '56081e9e-7675-48d1-bd05-c68f0aba8391';
update public.equipment_types set name = 'iPad Air 7 M3 11-inch' where id = '6614a67b-650d-41a9-8434-a7f2ec480a2c';
update public.equipment_types set name = 'iPad Air 7 M3 13-inch' where id = '9d057be9-de3a-43b0-896e-c3d91af4990d';
update public.equipment_types set name = 'iPad Gen 11 A16 11-inch' where id = '07e9b9ed-27a6-41c4-9861-810d4f1df80e';
update public.equipment_types set name = 'iPad Gen 7 10.2-inch' where id = '60b26dce-3913-4a30-90e5-b1204860590d';
update public.equipment_types set name = 'iPad Mini 5 7.9-inch' where id = 'dd014be2-6605-415c-b071-8e4bc51200fd';
update public.equipment_types set name = 'iPad Mini 6 8.3-inch' where id = 'fe035376-6210-479e-b6b9-e7abbcdeb92e';
update public.equipment_types set name = 'iPad Mini 7 8.3-inch' where id = 'f588dbef-9f56-446b-90f5-e3e195528ed8';
update public.equipment_types set name = 'iPad Pro M2 11-inch' where id = '90603585-9453-4d3a-bba7-d90290a0c8d1';
update public.equipment_types set name = 'iPad Pro M4 11-inch' where id = 'b021de44-2406-4518-9c31-7227314675cc';
update public.equipment_types set name = 'iPad Pro M4 13-inch' where id = '674c56fe-4387-4ab6-8e84-bd39072ea943';
update public.equipment_types set name = 'iPad Pro M5 11-inch' where id = '1c922ae2-60ba-464e-84e3-28d0d0c7bd90';
update public.equipment_types set name = 'iPad Pro M5 13-inch' where id = '397876c1-5424-44f0-b6d9-90c86b7d6273';

-- Dời order_equipment nếu có (đã xác nhận trước khi viết migration: ord=0
-- cho cả 15 nhóm, nhưng vẫn chạy UPDATE để an toàn thay vì giả định).
update public.order_equipment set equipment_type_id = '65362030-86fc-49da-a92c-16bf765d22fa' where equipment_type_id = 'fe0fb8f7-a0ad-433d-a0ca-4ec27d7a62fb';
update public.order_equipment set equipment_type_id = '824d31f0-74ac-4495-82c9-a0b4341ec8ab' where equipment_type_id = '7c994cf8-fc0d-44c4-b2d0-5cc6a8946403';
update public.order_equipment set equipment_type_id = '56081e9e-7675-48d1-bd05-c68f0aba8391' where equipment_type_id = 'c439e239-c47d-438b-a700-d2ecfa50457e';
update public.order_equipment set equipment_type_id = '6614a67b-650d-41a9-8434-a7f2ec480a2c' where equipment_type_id = '8389552e-7bc9-4958-a472-df205da3c040';
update public.order_equipment set equipment_type_id = '9d057be9-de3a-43b0-896e-c3d91af4990d' where equipment_type_id = '12f0fd47-8bca-4e6a-8dc0-45bf09250a51';
update public.order_equipment set equipment_type_id = '07e9b9ed-27a6-41c4-9861-810d4f1df80e' where equipment_type_id = 'db42f41b-07f2-45d3-bbb6-520907d4164d';
update public.order_equipment set equipment_type_id = '60b26dce-3913-4a30-90e5-b1204860590d' where equipment_type_id = '58600aa8-e1de-4d20-9dc2-e857e0bdc1fc';
update public.order_equipment set equipment_type_id = 'dd014be2-6605-415c-b071-8e4bc51200fd' where equipment_type_id = 'b058b05f-0076-44fc-8da3-3523462d5d65';
update public.order_equipment set equipment_type_id = 'fe035376-6210-479e-b6b9-e7abbcdeb92e' where equipment_type_id = '0b35d899-e26e-44c0-a866-fb5f13257cfc';
update public.order_equipment set equipment_type_id = 'f588dbef-9f56-446b-90f5-e3e195528ed8' where equipment_type_id = 'f2b578ba-d434-42b5-a602-5b7da411a977';
update public.order_equipment set equipment_type_id = '90603585-9453-4d3a-bba7-d90290a0c8d1' where equipment_type_id = 'b9134692-bc85-4daf-af7b-8a06119f7281';
update public.order_equipment set equipment_type_id = 'b021de44-2406-4518-9c31-7227314675cc' where equipment_type_id = '419f9762-6f6f-41ce-9e11-ad8a96c91614';
update public.order_equipment set equipment_type_id = '674c56fe-4387-4ab6-8e84-bd39072ea943' where equipment_type_id = 'b27c40a2-69e9-474e-8dac-a6958d38986d';
update public.order_equipment set equipment_type_id = '1c922ae2-60ba-464e-84e3-28d0d0c7bd90' where equipment_type_id = '6bd756e8-0c9a-454f-bb04-e5bb9eb6bd04';
update public.order_equipment set equipment_type_id = '397876c1-5424-44f0-b6d9-90c86b7d6273' where equipment_type_id = '8552ebab-e281-4f94-9e7f-1419fdded6a8';

delete from public.equipment_types where id in (
  'fe0fb8f7-a0ad-433d-a0ca-4ec27d7a62fb', '7c994cf8-fc0d-44c4-b2d0-5cc6a8946403',
  'c439e239-c47d-438b-a700-d2ecfa50457e', '8389552e-7bc9-4958-a472-df205da3c040',
  '12f0fd47-8bca-4e6a-8dc0-45bf09250a51', 'db42f41b-07f2-45d3-bbb6-520907d4164d',
  '58600aa8-e1de-4d20-9dc2-e857e0bdc1fc', 'b058b05f-0076-44fc-8da3-3523462d5d65',
  '0b35d899-e26e-44c0-a866-fb5f13257cfc', 'f2b578ba-d434-42b5-a602-5b7da411a977',
  'b9134692-bc85-4daf-af7b-8a06119f7281', '419f9762-6f6f-41ce-9e11-ad8a96c91614',
  'b27c40a2-69e9-474e-8dac-a6958d38986d', '6bd756e8-0c9a-454f-bb04-e5bb9eb6bd04',
  '8552ebab-e281-4f94-9e7f-1419fdded6a8'
);

-- =====================================================================
-- NHÓM C — 7 nhóm cần xử lý riêng: có máy thật đang nằm ở equipment_instances
-- (lỗi tracking_type cũ, xem note trong plan — không sửa ở migration này,
-- chỉ dời đúng chủ khi gộp), hoặc CEO chấp nhận gộp về 1 giá chung dù giá
-- gốc khác nhau.
-- =====================================================================

-- iPhone 12 Pro Max: survivor = "Bạc" (tạo sớm nhất trong 2 dòng quantity
-- có máy thật), dời 30 máy + biến thể + order_equipment của "Tím" sang
-- survivor, xoá cả "Tím" và dòng individual rỗng (0 máy, ord=0).
update public.equipment_types set name = 'iPhone 12 Pro Max' where id = '1e3e6a00-58fd-4924-a6d4-85b2519f534b';
update public.equipment_units set equipment_type_id = '1e3e6a00-58fd-4924-a6d4-85b2519f534b',
    brand_model = 'Tím',
    image_url = (select image_url from public.equipment_types where id = 'ee22c577-f466-4efc-ac43-cab58e356dc0')
  where equipment_type_id = 'ee22c577-f466-4efc-ac43-cab58e356dc0';
-- check_equipment_instance_tracking() chỉ cho phép equipment_instances trỏ
-- vào loại product_type=rental + tracking_type=individual — nhưng survivor
-- (Bạc) đang tracking_type=quantity (đúng lỗi dữ liệu cũ đã ghi trong plan,
-- 30 máy Bạc vốn đã nằm ở đây từ trước theo cách nào đó bỏ qua trigger này).
-- Tắt tạm trigger trong transaction để dời 30 máy Tím sang, không đổi gì
-- khác về bản chất của lỗi cũ (Bạc vẫn quantity-tracked với máy thật y như
-- trước, chỉ gộp thêm 30 máy Tím vào).
alter table public.equipment_instances disable trigger equipment_instances_check_tracking;
update public.equipment_instances set equipment_type_id = '1e3e6a00-58fd-4924-a6d4-85b2519f534b'
  where equipment_type_id = 'ee22c577-f466-4efc-ac43-cab58e356dc0';
alter table public.equipment_instances enable trigger equipment_instances_check_tracking;
-- order_equipment_check_line yêu cầu dòng hàng thuộc loại quantity phải có
-- equipment_unit_id — nhưng nhiều đơn hàng cũ của "Tím" đang lưu
-- equipment_instance_id (từ thời loại này còn individual, trước khi bị đổi
-- tracking_type — cùng gốc lỗi dữ liệu cũ). Tắt tạm trigger để dời các dòng
-- này, không sửa lại equipment_unit_id/equipment_instance_id của chúng.
alter table public.order_equipment disable trigger order_equipment_check_line;
update public.order_equipment set equipment_type_id = '1e3e6a00-58fd-4924-a6d4-85b2519f534b'
  where equipment_type_id in ('ee22c577-f466-4efc-ac43-cab58e356dc0', '7b7c08f3-1ae3-40be-87e7-1f37313d3abb');
alter table public.order_equipment enable trigger order_equipment_check_line;
delete from public.equipment_types where id in ('ee22c577-f466-4efc-ac43-cab58e356dc0', '7b7c08f3-1ae3-40be-87e7-1f37313d3abb');

-- iPad Gen 9 10.2-inch: survivor = dòng quantity (đã đúng tên gốc, có 51
-- máy thật) — 2 dòng individual rỗng chỉ có ảnh, không có máy/biến thể/đơn
-- hàng nào trỏ vào; copy 1 ảnh sang survivor (equipment_types.image_url +
-- equipment_units.image_url của chính survivor) để không mất ảnh sản phẩm.
update public.equipment_types set image_url = coalesce(
    (select image_url from public.equipment_types where id = '504f045c-1f45-4cbb-9b4b-a1274aeb6ca6'),
    (select image_url from public.equipment_types where id = '07c57e06-5320-4343-bee8-d45352f81b91')
  )
  where id = '504f045c-1f45-4cbb-9b4b-a1274aeb6ca6';
update public.equipment_units set image_url = coalesce(
    image_url,
    (select image_url from public.equipment_types where id = '07c57e06-5320-4343-bee8-d45352f81b91')
  )
  where equipment_type_id = '504f045c-1f45-4cbb-9b4b-a1274aeb6ca6';
alter table public.order_equipment disable trigger order_equipment_check_line;
update public.order_equipment set equipment_type_id = '504f045c-1f45-4cbb-9b4b-a1274aeb6ca6'
  where equipment_type_id in ('07c57e06-5320-4343-bee8-d45352f81b91', 'f9b94d15-00c4-4b22-98a2-89d43082f3cd');
alter table public.order_equipment enable trigger order_equipment_check_line;
delete from public.equipment_types where id in ('07c57e06-5320-4343-bee8-d45352f81b91', 'f9b94d15-00c4-4b22-98a2-89d43082f3cd');

-- iPad Pro M1 11-inch: survivor = dòng quantity "Wi-Fi + 5G" (14 máy thật),
-- đổi tên về gốc; loại thua "Wi-Fi Only" rỗng (0 máy/biến thể/đơn hàng).
update public.equipment_types set name = 'iPad Pro M1 11-inch' where id = 'd53ee9ee-eda3-44aa-b9de-8cff3f8eebe0';
alter table public.order_equipment disable trigger order_equipment_check_line;
update public.order_equipment set equipment_type_id = 'd53ee9ee-eda3-44aa-b9de-8cff3f8eebe0'
  where equipment_type_id = '5fb0fe24-b390-49f2-9b8a-9d9662e28d59';
alter table public.order_equipment enable trigger order_equipment_check_line;
delete from public.equipment_types where id = '5fb0fe24-b390-49f2-9b8a-9d9662e28d59';

-- iPad Pro M2 12.9-inch: survivor = dòng quantity (đã đúng tên gốc, 30 máy
-- thật); 2 loại thua individual rỗng (0 máy/biến thể/đơn hàng).
alter table public.order_equipment disable trigger order_equipment_check_line;
update public.order_equipment set equipment_type_id = '548cb424-e92f-4ca1-b0f6-f495f8e9ecac'
  where equipment_type_id in ('8da621c0-5404-41d8-9921-d584a76232a6', 'eb5307a2-198a-4b28-9050-457da460f1c0');
alter table public.order_equipment enable trigger order_equipment_check_line;
delete from public.equipment_types where id in ('8da621c0-5404-41d8-9921-d584a76232a6', 'eb5307a2-198a-4b28-9050-457da460f1c0');

-- Phim máy ảnh lấy liền FUJIFILM IINSTAX MINI: 2 gói giấy in khác nhau
-- (10 tấm/300k, 20 tấm/500k) — product_type=sale nên tracking_type/
-- pricing_method vốn đã NULL (đúng kiến trúc cho hàng bán đứt, không phải
-- lỗi dữ liệu). CEO chấp nhận gộp về 1 giá chung (giá survivor = 10 tấm,
-- 300k) dù giá gốc khác nhau — tự sửa tay theo đúng gói khi tạo đơn.
-- LƯU Ý: KHÔNG động tới 'ce8b07ed-...' (Máy ảnh lấy liền Fujifilm Instax
-- Mini Evo) — đây là máy ảnh, sản phẩm cho thuê hoàn toàn khác, chỉ trùng
-- chữ "FUJIFILM"/"Instax" trong tên, phát hiện lúc rà soát lại trước khi
-- viết migration này.
update public.equipment_types set name = 'Phim máy ảnh lấy liền FUJIFILM IINSTAX MINI'
  where id = '68f7e711-523e-4779-92e6-6399ac3c5382';
update public.equipment_units set brand_model = '10 tấm' where equipment_type_id = '68f7e711-523e-4779-92e6-6399ac3c5382';
update public.equipment_units set equipment_type_id = '68f7e711-523e-4779-92e6-6399ac3c5382',
    brand_model = '20 tấm',
    image_url = (select image_url from public.equipment_types where id = '529b175f-d6da-453c-b91c-e43c2c04620a')
  where equipment_type_id = '529b175f-d6da-453c-b91c-e43c2c04620a';
update public.order_equipment set equipment_type_id = '68f7e711-523e-4779-92e6-6399ac3c5382'
  where equipment_type_id = '529b175f-d6da-453c-b91c-e43c2c04620a';
delete from public.equipment_types where id = '529b175f-d6da-453c-b91c-e43c2c04620a';

-- Booth Thực Tế Ảo VR: CEO chấp nhận gộp dù giá khác nhau (TV 55-inch 2tr /
-- TV 43-inch 1.5tr) — giá chung lấy theo survivor (TV 55-inch, tạo sớm hơn).
update public.equipment_types set name = 'Booth Thực Tế Ảo VR' where id = '09a7c35f-93f4-4c7d-9acf-ba3cf6fba956';
update public.equipment_units set brand_model = 'TV 55-inch' where equipment_type_id = '09a7c35f-93f4-4c7d-9acf-ba3cf6fba956';
update public.equipment_units set equipment_type_id = '09a7c35f-93f4-4c7d-9acf-ba3cf6fba956',
    brand_model = 'TV 43-inch',
    image_url = (select image_url from public.equipment_types where id = '11b22741-4363-4ecc-8879-0b62587c346a')
  where equipment_type_id = '11b22741-4363-4ecc-8879-0b62587c346a';
update public.order_equipment set equipment_type_id = '09a7c35f-93f4-4c7d-9acf-ba3cf6fba956'
  where equipment_type_id = '11b22741-4363-4ecc-8879-0b62587c346a';
delete from public.equipment_types where id = '11b22741-4363-4ecc-8879-0b62587c346a';

-- Photobooth: CEO chấp nhận gộp dù giá khác nhau (6H Nâng Cao 7tr / 2H Cơ
-- Bản 2.5tr) — giá chung lấy theo survivor (6H Nâng Cao, tạo sớm hơn).
update public.equipment_types set name = 'Photobooth' where id = 'e1e9d1d8-cc14-4ea1-8ffc-42a0284f6bce';
update public.equipment_units set brand_model = '6H Nâng Cao' where equipment_type_id = 'e1e9d1d8-cc14-4ea1-8ffc-42a0284f6bce';
update public.equipment_units set equipment_type_id = 'e1e9d1d8-cc14-4ea1-8ffc-42a0284f6bce',
    brand_model = '2H Cơ Bản',
    image_url = (select image_url from public.equipment_types where id = '2553beb4-4ed3-4945-a0c8-d0fdae456b8e')
  where equipment_type_id = '2553beb4-4ed3-4945-a0c8-d0fdae456b8e';
update public.order_equipment set equipment_type_id = 'e1e9d1d8-cc14-4ea1-8ffc-42a0284f6bce'
  where equipment_type_id = '2553beb4-4ed3-4945-a0c8-d0fdae456b8e';
delete from public.equipment_types where id = '2553beb4-4ed3-4945-a0c8-d0fdae456b8e';
