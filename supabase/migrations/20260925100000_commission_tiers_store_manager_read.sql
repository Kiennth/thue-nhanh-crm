-- Khoán dự kiến trên đơn (CEO 2026-09-25): Cửa hàng trưởng được xem quỹ
-- khoán + % từng khâu. Quỹ tính từ bảng bậc %hoa hồng của chi nhánh, nên
-- Cửa hàng trưởng cần ĐỌC bậc của đúng kho mình (không phải toàn hệ thống —
-- trang Chính sách khoán vẫn chỉ Giám đốc/Kế toán).
drop policy if exists "commission_tiers_select_admin_ketoan" on public.commission_tiers;
create policy "commission_tiers_select_admin_ketoan" on public.commission_tiers
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
