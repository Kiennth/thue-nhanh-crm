-- Phiếu "Ghi lại hàng đã có" (CEO 2026-10-07: "thêm option chèn lại NCC cho
-- những mã có sẵn, vì giờ hàng nhiều quá, cần làm ngược lại luôn").
-- kind = 'backfill': không nhập kho mới — bấm Ghi nhận thì gắn máy SERIAL đã
-- có vào phiếu (purchase_order_id → NCC), ghi giá mua + ngày mua = ngày trên
-- phiếu, bảo hành nếu có; hàng SỐ LƯỢNG chỉ thêm dòng giá vốn
-- equipment_purchases (không cộng tồn). Máy đã gắn phiếu khác thì báo lỗi.

alter table public.purchase_orders
  add column if not exists kind text not null default 'new' check (kind in ('new', 'backfill'));

create or replace function public.receive_purchase_order(p_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  po record;
  l record;
  t record;
  inst record;
  s text;
  n integer;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into po from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'Không tìm thấy phiếu mua'; end if;
  if po.status not in ('draft', 'ordered') then raise exception 'Phiếu % đã nhập kho hoặc đã huỷ', po.code; end if;
  if not public.can_purchase_branch(po.branch_id) then raise exception 'Không có quyền xử lý phiếu này'; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = p_id) then
    raise exception 'Phiếu chưa có dòng hàng nào';
  end if;

  for l in select * from public.purchase_order_lines where purchase_order_id = p_id order by position, created_at loop
    select id, name, tracking_type into t from public.equipment_types where id = l.equipment_type_id;
    if t.tracking_type = 'individual' then
      n := coalesce(array_length(l.serials, 1), 0);
      if n <> l.quantity then
        raise exception '%: cần % serial, mới có %', t.name, l.quantity, n;
      end if;
      foreach s in array l.serials loop
        if po.kind = 'backfill' then
          select id, equipment_type_id, purchase_order_id into inst
            from public.equipment_instances where lower(identifier_code) = lower(trim(s)) limit 1;
          if not found then raise exception 'Serial % chưa có trong CRM', trim(s); end if;
          if inst.equipment_type_id <> t.id then raise exception 'Serial % thuộc mã hàng khác', trim(s); end if;
          if inst.purchase_order_id is not null and inst.purchase_order_id <> p_id then
            raise exception 'Serial % đã gắn phiếu mua khác', trim(s);
          end if;
          update public.equipment_instances
             set purchase_order_id = p_id,
                 purchase_price = l.unit_cost,
                 purchase_date = po.order_date,
                 warranty_expires_on = coalesce(l.warranty_expires_on, warranty_expires_on),
                 equipment_unit_id = coalesce(equipment_unit_id, l.equipment_unit_id)
           where id = inst.id;
        else
          if exists (select 1 from public.equipment_instances where lower(identifier_code) = lower(trim(s))) then
            raise exception 'Serial % đã có trong CRM', trim(s);
          end if;
          insert into public.equipment_instances
            (equipment_type_id, equipment_unit_id, identifier_code, branch_id, status,
             purchase_price, purchase_date, purchase_order_id, warranty_expires_on, condition_notes)
          values
            (t.id, l.equipment_unit_id, trim(s), po.branch_id, 'available',
             l.unit_cost, today, p_id, l.warranty_expires_on, 'Nhập kho từ phiếu ' || po.code);
        end if;
      end loop;
    elsif t.tracking_type = 'quantity' then
      if l.equipment_unit_id is null then
        raise exception '%: chọn biến thể trước', t.name;
      end if;
      if po.kind <> 'backfill' then
        insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
        values (l.equipment_unit_id, po.branch_id, l.quantity)
        on conflict (equipment_unit_id, branch_id)
        do update set quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;
      end if;
      insert into public.equipment_purchases
        (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by, purchase_order_id)
      values
        (l.equipment_unit_id, po.branch_id, l.quantity, l.unit_cost,
         case when po.kind = 'backfill' then po.order_date else today end,
         'Phiếu ' || po.code, public.auth_employee_id(), p_id);
    else
      raise exception '%: hàng combo/dịch vụ không nhập kho được', t.name;
    end if;
  end loop;

  update public.purchase_orders
     set status = 'received', received_at = now(), received_by = public.auth_employee_id()
   where id = p_id;
end;
$$;

-- Phiếu thử 2026-10-07 đã xoá — đặt lại để phiếu thật đầu tiên là MH0001.
select setval('public.purchase_order_code_seq', 1, false);
