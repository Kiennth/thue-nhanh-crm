-- Mã số ĐVQHNS (mã số đơn vị có quan hệ với ngân sách) của khách — khách là
-- cơ quan/đơn vị sự nghiệp nhà nước cần ghi trên hợp đồng/chứng từ/hoá đơn
-- (CEO 2026-10-04).
alter table public.customers add column if not exists budget_unit_code text;
