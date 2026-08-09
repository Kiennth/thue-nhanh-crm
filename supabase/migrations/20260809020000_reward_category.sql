-- ---------------------------------------------------------------------
-- Module Thưởng (CEO 2026-08-09): nâng "Thưởng đột xuất" thành module
-- riêng bên sidebar (/rewards) — mọi khoản trao tay đều vào chung 1 sổ
-- reward_entries, phân LOẠI để lọc/thống kê: bất chợt, doanh số, định kỳ,
-- Tết, sinh nhật, khác. Thưởng THEO KHOÁN vẫn tự động qua bonus_tiers
-- (qui luật riêng, không ghi vào sổ này) — trang /rewards chỉ hiển thị
-- tóm tắt để nhìn 1 chỗ thấy hết các loại thưởng.
-- ---------------------------------------------------------------------

alter table public.reward_entries
  add column category text not null default 'bat_chot'
  check (category in ('bat_chot', 'doanh_so', 'dinh_ky', 'tet', 'sinh_nhat', 'khac'));
