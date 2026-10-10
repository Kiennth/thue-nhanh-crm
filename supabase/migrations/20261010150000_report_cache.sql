-- Bộ nhớ đệm báo cáo (Grok tách gọn CRM 10/10 §7/§10): quỹ lương theo kho của
-- từng tháng (tính bảng lương toàn công ty rất nặng — Trang chủ cũ mất 7s khi
-- chọn "Năm nay"). Tháng đã qua dùng lại; tháng hiện tại tính lại sau 15 phút.
-- RLS bật, KHÔNG có policy → chỉ service role (admin client phía server) đọc/ghi.
create table if not exists public.report_cache (
  key text primary key,
  data jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.report_cache enable row level security;

notify pgrst, 'reload schema';
