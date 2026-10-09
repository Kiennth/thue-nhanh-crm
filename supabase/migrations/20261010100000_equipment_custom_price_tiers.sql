-- B3 (Grok CRM 09/10): thang giá riêng theo mã hàng. Không thêm bộ máy tính
-- giá mới — thang riêng chỉ là 1 bảng giá mẫu "ẩn" thuộc về đúng 1 mã
-- (owner_equipment_type_id), mã đó trỏ pricing_template_id vào nó. Nhờ vậy
-- công thức tieredPrice (nội suy giữa mốc, ≥1 tháng = giá tháng/30), đơn đã
-- tạo (giữ unit_price) và web (website_pricing_tiers_public theo
-- pricing_template_id) đều chạy y như cũ. Mã chưa có thang riêng: không đổi giá.
alter table public.pricing_templates
  add column if not exists owner_equipment_type_id uuid unique
    references public.equipment_types(id) on delete cascade;

comment on column public.pricing_templates.owner_equipment_type_id is
  'Thang giá riêng của 1 mã hàng (null = bảng giá mẫu dùng chung).';

-- Nhật ký hoạt động ghi cả từng bậc giá (ai sửa, lúc nào, cũ → mới).
drop trigger if exists pricing_template_tiers_log_activity on public.pricing_template_tiers;
create trigger pricing_template_tiers_log_activity
  after insert or update or delete on public.pricing_template_tiers
  for each row execute function public.log_activity();

notify pgrst, 'reload schema';
