-- Danh sách Website trong CRM chỉ cần biết "có mô tả VI / EN chưa" (nhãn Thiếu
-- mô tả / Thiếu EN, xếp theo độ đầy đủ) — 2 cột tự tính để khỏi kéo cả HTML
-- mô tả về (Grok CRM 09/10 §A: trang từng ~790KB).
alter table public.website_products
  add column if not exists has_description boolean
    generated always as (coalesce(description_html, '') <> '') stored,
  add column if not exists has_description_en boolean
    generated always as (coalesce(description_html_en, '') <> '') stored;

notify pgrst, 'reload schema';
