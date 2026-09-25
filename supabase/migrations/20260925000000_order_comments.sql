-- CEO 2026-09-25: mỗi đơn hàng có khung bình luận + trả lời để nhân viên
-- ghi chú, lưu lại lịch sử trao đổi. Chỉ GHI THÊM — không có policy update
-- nên bình luận đã đăng không sửa được (lịch sử nguyên vẹn); chỉ Giám đốc
-- xoá được khi ghi nhầm/spam. Trả lời 1 tầng: parent_id trỏ về bình luận
-- gốc (trả lời của trả lời vẫn gắn vào bình luận gốc ở tầng app).
--
-- Mọi nhân viên đọc + viết được trên MỌI đơn (khớp quyết định 2026-08-05
-- mở SELECT orders toàn hệ thống để hỗ trợ chéo chi nhánh) — trao đổi giữa
-- 2 kho về 1 đơn là đúng nhu cầu.
create table public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  parent_id uuid references public.order_comments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index order_comments_order_id_idx on public.order_comments(order_id, created_at);
create index order_comments_parent_id_idx on public.order_comments(parent_id);

alter table public.order_comments enable row level security;

create policy "order_comments_select_employees" on public.order_comments
  for select to authenticated using (public.is_employee());

-- Chỉ được đăng dưới tên chính mình.
create policy "order_comments_insert_self" on public.order_comments
  for insert to authenticated with check (
    employee_id = (select e.id from public.employees e where e.user_id = auth.uid() and e.is_active limit 1)
  );

create policy "order_comments_delete_giam_doc" on public.order_comments
  for delete to authenticated using (public.auth_role() = 'giam_doc');
