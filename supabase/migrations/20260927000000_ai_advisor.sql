-- ---------------------------------------------------------------------
-- Trang TƯ VẤN MÁY CHẠY AI (CEO chốt 2026-09-26): web riêng, thương hiệu
-- riêng (repo du-may), đọc CHÍNH Supabase này bằng anon key — cùng cơ chế
-- web công khai (20260816000000_website_catalog.sql):
--
--   1. advisor_hardware: danh mục máy để tính "chạy model X cần máy gì" —
--      bộ nhớ dùng được cho model, băng thông bộ nhớ, sức tính. Link mềm
--      sang loại hàng CRM (1 mã THUÊ + 1 mã BÁN) để giá luôn lấy live.
--   2. advisor_benchmarks: tốc độ ĐO THẬT trên máy của mình — có số đo thì
--      web ưu tiên số đo thay cho ước tính công thức.
--   3. Lead dùng chung website_leads (nhân viên xem chung 1 hộp thư), thêm
--      source/intent/details để biết khách đến từ trang tư vấn, muốn mua
--      hay thuê, và cấu hình khách vừa tính.
--
-- Anon chỉ đọc qua view *_public, chỉ ghi qua RPC advisor_submit_lead.
-- Chưa có màn quản trị trong CRM — sửa danh mục máy qua Dashboard.
-- ---------------------------------------------------------------------

-- =============================== BẢNG ================================

create table if not exists public.advisor_hardware (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- mac | pc_gpu | workstation | mini_ai | laptop — chỉ để web nhóm/lọc.
  kind text not null check (kind in ('mac', 'pc_gpu', 'workstation', 'mini_ai', 'laptop')),
  -- Tổng bộ nhớ chứa model: VRAM (PC) hoặc RAM hợp nhất (Mac/mini AI).
  memory_gb numeric(7, 1) not null check (memory_gb > 0),
  -- Phần thực sự dùng được cho model: macOS mặc định chỉ cấp ~2/3 (máy
  -- ≤36GB) hoặc ~3/4 RAM cho GPU; card rời trừ phần driver/màn hình.
  usable_memory_gb numeric(7, 1) not null check (usable_memory_gb > 0),
  -- Băng thông bộ nhớ MỖI card/chip (GB/s) — quyết định tốc độ sinh chữ.
  -- Nhiều card chia lớp model thì chữ đi lần lượt qua từng card, tốc độ
  -- xấp xỉ 1 card nên KHÔNG nhân theo số card.
  bandwidth_gbps numeric(8, 1) not null check (bandwidth_gbps > 0),
  -- Sức tính FP16 ước lượng (TFLOPS, tổng các card) — quyết định tốc độ đọc
  -- prompt dài. Số thô, chỉ để so tương đối.
  prefill_tflops numeric(8, 1),
  gpu_count integer not null default 1 check (gpu_count >= 1),
  -- Mô tả ngắn cho khách (ưu/nhược).
  note text,
  -- Giá tham khảo khi chưa có mã BÁN trong CRM (hàng lấy sỉ theo đơn).
  ref_price_vnd numeric(14, 0),
  rent_equipment_type_id uuid references public.equipment_types(id) on delete set null,
  sale_equipment_type_id uuid references public.equipment_types(id) on delete set null,
  -- Xếp XẤP XỈ theo giá rẻ → đắt: web dùng để chọn mức "Vừa đủ" khi máy
  -- chưa có giá, và làm thứ tự bảng so sánh.
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advisor_hardware_set_updated_at
  before update on public.advisor_hardware
  for each row execute function public.set_updated_at();

create table if not exists public.advisor_benchmarks (
  id uuid primary key default gen_random_uuid(),
  hardware_id uuid not null references public.advisor_hardware(id) on delete cascade,
  -- Khớp slug model trong danh mục model của web du-may (src/data/models.ts).
  model_slug text not null,
  -- q4 | q5 | q6 | q8 | fp16 | native — khớp danh sách mức nén của web.
  quant text not null,
  context_tokens integer,
  -- Tốc độ sinh chữ (token/giây) và đọc prompt (token/giây).
  decode_tps numeric(8, 1) not null check (decode_tps > 0),
  prefill_tps numeric(10, 1),
  -- Phần mềm đo: llama.cpp / LM Studio / Ollama / MLX / vLLM...
  runtime text,
  note text,
  measured_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists advisor_benchmarks_hw_model_idx
  on public.advisor_benchmarks (hardware_id, model_slug);

-- Lead: thêm nguồn + nhu cầu + cấu hình vào hộp thư chung.
alter table public.website_leads
  add column if not exists source text not null default 'website',
  -- buy | rent | rent_to_buy | advice
  add column if not exists intent text,
  add column if not exists details jsonb;

-- ================================ RLS ================================

alter table public.advisor_hardware enable row level security;
alter table public.advisor_benchmarks enable row level security;

create policy "advisor_hardware_select_employees" on public.advisor_hardware
  for select to authenticated using (public.is_employee());
create policy "advisor_hardware_insert_admin_ketoan" on public.advisor_hardware
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "advisor_hardware_update_admin_ketoan" on public.advisor_hardware
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "advisor_hardware_delete_admin_ketoan" on public.advisor_hardware
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create policy "advisor_benchmarks_select_employees" on public.advisor_benchmarks
  for select to authenticated using (public.is_employee());
create policy "advisor_benchmarks_insert_admin_ketoan" on public.advisor_benchmarks
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "advisor_benchmarks_update_admin_ketoan" on public.advisor_benchmarks
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "advisor_benchmarks_delete_admin_ketoan" on public.advisor_benchmarks
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- ============================ VIEW PUBLIC ============================
-- security_invoker = off như website_products_public: CHỈ cột an toàn,
-- giá bán/giá thuê niêm yết lấy live từ equipment_types. Không thêm giá
-- vốn/tồn kho vào đây.

create or replace view public.advisor_hardware_public
  with (security_invoker = off) as
select
  h.slug,
  h.name,
  h.kind,
  h.memory_gb,
  h.usable_memory_gb,
  h.bandwidth_gbps,
  h.prefill_tflops,
  h.gpu_count,
  h.note,
  -- Giá bán: mã BÁN trong CRM trước, không có thì giá tham khảo.
  coalesce(sale_et.price, h.ref_price_vnd) as sale_price_vnd,
  (sale_et.id is not null) as sale_in_crm,
  rent_et.price as rent_price_vnd,
  rent_et.rental_period_unit as rent_period_unit,
  rent_et.deposit_amount as rent_deposit_vnd,
  -- Trang sản phẩm trên web cho thuê (nếu đã publish).
  (
    select wp.slug from public.website_products wp
    where wp.equipment_type_id = h.rent_equipment_type_id and wp.is_published
  ) as rent_website_slug,
  h.sort_order
from public.advisor_hardware h
left join public.equipment_types rent_et
  on rent_et.id = h.rent_equipment_type_id and rent_et.product_type = 'rental'
left join public.equipment_types sale_et
  on sale_et.id = h.sale_equipment_type_id and sale_et.product_type = 'sale'
where h.is_published;

create or replace view public.advisor_benchmarks_public
  with (security_invoker = off) as
select
  h.slug as hardware_slug,
  b.model_slug,
  b.quant,
  b.context_tokens,
  b.decode_tps,
  b.prefill_tps,
  b.runtime,
  b.measured_at
from public.advisor_benchmarks b
join public.advisor_hardware h on h.id = b.hardware_id
where h.is_published;

grant select on public.advisor_hardware_public to anon, authenticated;
grant select on public.advisor_benchmarks_public to anon, authenticated;

-- ============================ RPC LEAD ===============================
-- Điểm ghi thứ 2 của anon (sau website_submit_lead), grant CÓ CHỦ ĐÍCH.

create or replace function public.advisor_submit_lead(
  p_name text,
  p_phone text,
  p_intent text,
  p_message text default null,
  p_hardware_slug text default null,
  p_details jsonb default null,
  p_source_page text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 200 then
    raise exception 'invalid_name';
  end if;
  if p_phone is null or length(regexp_replace(p_phone, '[^0-9+]', '', 'g')) < 8
     or length(p_phone) > 20 then
    raise exception 'invalid_phone';
  end if;
  if p_intent is null or p_intent not in ('buy', 'rent', 'rent_to_buy', 'advice') then
    raise exception 'invalid_intent';
  end if;
  if length(coalesce(p_message, '')) > 2000
     or length(coalesce(p_hardware_slug, '')) > 200
     or length(coalesce(p_source_page, '')) > 500
     or length(coalesce(p_details::text, '')) > 4000 then
    raise exception 'too_long';
  end if;
  if p_details is not null and jsonb_typeof(p_details) <> 'object' then
    raise exception 'invalid_details';
  end if;

  insert into public.website_leads
    (name, phone, message, product_slug, source_page, source, intent, details)
  values (trim(p_name), trim(p_phone), nullif(trim(p_message), ''),
          nullif(trim(p_hardware_slug), ''), nullif(trim(p_source_page), ''),
          'advisor', p_intent, p_details)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.advisor_submit_lead(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.advisor_submit_lead(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- ============================ SEED MÁY ===============================
-- Thông số theo công bố của hãng (băng thông, bộ nhớ); TFLOPS là ước lượng
-- thô. Giá để trống — gắn mã CRM hoặc điền ref_price_vnd qua Dashboard.
-- Máy đời mới hơn (M5, RTX đời sau...) thêm tay khi về hàng.

insert into public.advisor_hardware
  (slug, name, kind, memory_gb, usable_memory_gb, bandwidth_gbps, prefill_tflops, gpu_count, sort_order, note)
values
  ('macbook-air-m1-16', 'MacBook Air M1 16GB', 'laptop', 16, 10.7, 68, 2.6, 1, 10,
   'Máy văn phòng phổ biến. Chạy được model nhỏ 7–8B để thử, không hợp dùng lâu dài.'),
  ('mac-mini-m4-16', 'Mac mini M4 16GB', 'mac', 16, 10.7, 120, 4.3, 1, 15,
   'Rẻ, êm, tiết kiệm điện. Đủ cho model nhỏ chạy trợ lý cá nhân.'),
  ('macbook-pro-m1-pro-16', 'MacBook Pro 14" M1 Pro 16GB', 'laptop', 16, 10.7, 200, 5.2, 1, 20,
   'Băng thông gấp 3 Air nên model nhỏ chạy mượt, nhưng 16GB giới hạn cỡ model.'),
  ('laptop-rtx-4060-8', 'Laptop gaming RTX 4060 8GB', 'laptop', 8, 7.5, 256, 40, 1, 30,
   'Card mạnh nhưng VRAM 8GB chỉ chứa model ~7B nén 4-bit.'),
  ('pc-rtx-4060ti-16', 'PC RTX 4060 Ti 16GB', 'pc_gpu', 16, 15, 288, 44, 1, 35,
   'Card 16GB rẻ nhất, băng thông thấp nên tốc độ vừa phải.'),
  ('pc-rtx-3090-24', 'PC RTX 3090 24GB', 'pc_gpu', 24, 23, 936, 71, 1, 40,
   'Card cũ giá tốt nhất cho 24GB VRAM. Tốn điện, nóng.'),
  ('pc-rtx-5070ti-16', 'PC RTX 5070 Ti 16GB', 'pc_gpu', 16, 15, 896, 88, 1, 45,
   'Model ≤14B chạy rất nhanh, nhưng 16GB không chứa nổi model 30B.'),
  ('mac-mini-m4-pro-64', 'Mac mini M4 Pro 64GB', 'mac', 64, 48, 273, 9, 1, 50,
   'Chạy được model 30B mượt, 70B nén 4-bit vừa khít nhưng chậm.'),
  ('ryzen-ai-max-395-128', 'Mini PC Ryzen AI Max+ 395 128GB', 'mini_ai', 128, 96, 256, 30, 1, 55,
   'Nhiều bộ nhớ giá mềm, hợp model MoE lớn (chỉ kích hoạt ít tham số). Chậm với model dày.'),
  ('pc-rtx-4090-24', 'PC RTX 4090 24GB', 'pc_gpu', 24, 23, 1008, 165, 1, 70,
   'Nhanh, đọc prompt dài cực tốt. Model 32B nén 4-bit vừa đủ.'),
  ('pc-2x-rtx-3090-48', 'PC 2× RTX 3090 (48GB)', 'workstation', 48, 46, 936, 142, 2, 72,
   'Cách rẻ nhất để có 48GB VRAM chạy 70B nén 4-bit. Cần nguồn 1200W+.'),
  ('pc-rtx-5090-32', 'PC RTX 5090 32GB', 'pc_gpu', 32, 31, 1792, 210, 1, 80,
   'Card phổ thông nhanh nhất. Model 32B chạy rất mượt, ngữ cảnh dài.'),
  ('mac-studio-m4-max-128', 'Mac Studio M4 Max 128GB', 'mac', 128, 96, 546, 17, 1, 82,
   'Cân bằng giá/bộ nhớ. Chạy 70B nén 4-bit ổn, model MoE ~100B rất mượt.'),
  ('dgx-spark-128', 'NVIDIA DGX Spark 128GB', 'mini_ai', 128, 115, 273, 100, 1, 85,
   'Hệ sinh thái CUDA, 128GB. Đọc prompt nhanh hơn Mac nhưng sinh chữ chậm hơn Mac Ultra.'),
  ('mac-studio-m3-ultra-96', 'Mac Studio M3 Ultra 96GB', 'mac', 96, 72, 819, 28, 1, 86,
   'Băng thông Ultra nhưng bộ nhớ vừa phải — 70B nén 4-bit chạy nhanh.'),
  ('mac-studio-m2-ultra-192', 'Mac Studio M2 Ultra 192GB', 'mac', 192, 144, 800, 27, 1, 88,
   'Đời trước nhưng băng thông vẫn rất cao, 192GB chạy được model lớn.'),
  ('pc-2x-rtx-5090-64', 'PC 2× RTX 5090 (64GB)', 'workstation', 64, 62, 1792, 420, 2, 100,
   'Rất nhanh cho model tới ~70B. Cần nguồn 1600W, tản nhiệt tốt.'),
  ('mac-studio-m3-ultra-256', 'Mac Studio M3 Ultra 256GB', 'mac', 256, 192, 819, 28, 1, 105,
   'Chạy model MoE cỡ 200B+ trên một máy để bàn yên tĩnh.'),
  ('ws-rtx-pro-6000-96', 'Workstation RTX PRO 6000 Blackwell 96GB', 'workstation', 96, 95, 1792, 250, 1, 110,
   'Một card 96GB: chạy 70B bản chất lượng cao, phục vụ nhiều người cùng lúc.'),
  ('mac-studio-m3-ultra-512', 'Mac Studio M3 Ultra 512GB', 'mac', 512, 384, 819, 28, 1, 120,
   'Máy để bàn duy nhất chạy được DeepSeek 671B / Kimi K2 nén thấp. Đọc prompt dài chậm hơn GPU NVIDIA.')
on conflict (slug) do nothing;
