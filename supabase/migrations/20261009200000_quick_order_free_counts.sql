-- Tốc độ modal Tạo đơn (Grok CRM 09/10 §A.3-4): trước đây getQuickOrderCatalog
-- kéo ~2.200 máy "available" (3 lượt phân trang) + ~350 dòng đơn mở đang gắn
-- máy về server rồi đếm trong JS (~4 giây từ VN). Nay đếm trong Postgres, trả
-- vài trăm dòng (loại hàng × biến thể × kho). Tồn chỉ để tham khảo, không chặn.
create or replace function public.quick_order_free_counts()
returns table (equipment_type_id uuid, equipment_unit_id uuid, branch_id uuid, n int)
language sql
stable
security invoker
set search_path = public
as $$
  select i.equipment_type_id, i.equipment_unit_id, i.branch_id, count(*)::int
  from public.equipment_instances i
  where i.status = 'available'
    and i.branch_id is not null
    and not exists (
      select 1
      from public.order_equipment oe
      join public.orders o on o.id = oe.order_id
      where oe.equipment_instance_id = i.id
        and o.completed_at is null
        and o.cancelled_at is null
    )
  group by 1, 2, 3;
$$;

grant execute on function public.quick_order_free_counts() to authenticated;

notify pgrst, 'reload schema';
