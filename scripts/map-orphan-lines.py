import json, urllib.request, urllib.parse, socket, sys, uuid
socket.setdefaulttimeout(30)
env = dict(l.strip().split('=',1) for l in open('/Users/nguyentrungkien/Documents/Thuê Nhanh CRM/.env.production') if '=' in l and not l.startswith('#'))
BASE = env['NEXT_PUBLIC_SUPABASE_URL'].strip('"') + '/rest/v1'; KEY = env['SUPABASE_SERVICE_ROLE_KEY'].strip('"')
HJ = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HMIN = {**HJ, 'Prefer': 'return=minimal'}
HREP = {**HJ, 'Prefer': 'return=representation'}
def req(method, path, body=None, params=None, headers=None):
    url = BASE + path + ('?' + urllib.parse.urlencode(params, safe='(),*') if params else '')
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers or HJ, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            b = resp.read(); return resp.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
def map_orphans(line_pattern, type_name, variant=None, tag='CEO 2026-09-30'):
    st, et = req('GET', '/equipment_types', params={'select': 'id,name,tracking_type,product_type', 'name': f'eq.{type_name}'})
    if not et:
        st, et = req('GET', '/equipment_types', params={'select': 'id,name,tracking_type,product_type', 'name': f'ilike.{type_name}'})
    assert et, f'KHÔNG THẤY SP: {type_name}'
    e = et[0]; TID = e['id']
    print(f"SP: {e['name']} [{e['tracking_type'] or e['product_type']}]")
    uid = None
    if variant or e['tracking_type'] == 'quantity' or e['product_type'] == 'sale':
        st, units = req('GET', '/equipment_units', params={'select': 'id,brand_model', 'equipment_type_id': f'eq.{TID}'})
        if variant:
            uid = next((u['id'] for u in units if u['brand_model'].upper() == variant.upper()), None)
            if not uid:
                st, u = req('POST', '/equipment_units', {'equipment_type_id': TID, 'brand_model': variant}, headers=HREP)
                uid = u[0]['id']; print(f'  + tạo biến thể {variant}')
        elif units:
            uid = units[0]['id']
        else:
            st, u = req('POST', '/equipment_units', {'equipment_type_id': TID, 'brand_model': e['name']}, headers=HREP)
            uid = u[0]['id']; print('  + tạo biến thể mặc định')
    st, lines = req('GET', '/order_equipment', params={'select': 'id,order_id,custom_name,quantity,unit_price,line_total,orders(order_code,completed_at,pickup_branch_id)', 'custom_name': f'ilike.{line_pattern}', 'equipment_type_id': 'is.null'})
    if not lines: print(f'  không còn dòng nào khớp "{line_pattern}"'); return
    st, inst = req('GET', '/equipment_instances', params={'select': 'id,identifier_code,branch_id', 'equipment_type_id': f'eq.{TID}', 'status': 'eq.available'})
    # Máy đã nằm trong dòng của đơn CHƯA ĐÓNG (kể cả chính đơn này) thì không
    # được lấy lại — status vẫn 'available' tới lúc giao nên phải lọc tay.
    st, busy = req('GET', '/order_equipment', params={'select': 'equipment_instance_id,orders!inner(completed_at,cancelled_at)', 'equipment_type_id': f'eq.{TID}', 'equipment_instance_id': 'not.is.null', 'orders.completed_at': 'is.null', 'orders.cancelled_at': 'is.null', 'limit': '1000'})
    used = set(b['equipment_instance_id'] for b in (busy or [])); seq = [0]
    def take(br, n):
        real = [i['id'] for i in inst if i['branch_id'] == br and not i['identifier_code'].startswith('AUTO') and i['id'] not in used]
        auto = [i['id'] for i in inst if i['branch_id'] == br and i['identifier_code'].startswith('AUTO') and i['id'] not in used]
        got = (real + auto)[:n]; used.update(got); return got
    pref = ''.join(c for c in type_name.upper() if c.isalnum())[:8]
    for l in lines:
        qty = l['quantity']; total = l['line_total']; o = l['orders']
        note = f'Gắn lại từ dòng tự do "{l["custom_name"]}" ({tag})'
        body = {'equipment_type_id': TID, 'custom_name': None, 'note': note}
        if e['product_type'] == 'service':
            pass
        elif e['tracking_type'] == 'quantity' or e['product_type'] == 'sale':
            body['equipment_unit_id'] = uid
        else:
            ids = []
            if o['completed_at']:
                for i in range(qty):
                    seq[0] += 1
                    st2, ni = req('POST', '/equipment_instances', {'equipment_type_id': TID, 'equipment_unit_id': uid, 'identifier_code': f'AUTO-HIST-{pref}-{uuid.uuid4().hex[:6]}', 'status': 'disposed'}, headers=HREP)
                    assert st2 == 201, ni
                    ids.append(ni[0]['id'])
            else:
                ids = take(o['pickup_branch_id'], qty)
                if uid:
                    for iid in ids: req('PATCH', f'/equipment_instances?id=eq.{iid}', {'equipment_unit_id': uid}, headers=HMIN)
                while len(ids) < qty:
                    seq[0] += 1
                    st2, ni = req('POST', '/equipment_instances', {'equipment_type_id': TID, 'equipment_unit_id': uid, 'identifier_code': f'AUTO-SYNC-{pref}-{uuid.uuid4().hex[:6]}', 'status': 'available', 'branch_id': o['pickup_branch_id']}, headers=HREP)
                    assert st2 == 201, ni
                    ids.append(ni[0]['id'])
            per = round(total / qty, 2)
            st2, r = req('PATCH', f"/order_equipment?id=eq.{l['id']}",
                {**body, 'equipment_instance_id': ids[0], 'quantity': 1, 'line_total': total - per * (qty - 1)}, headers=HMIN)
            assert st2 == 204, r
            for i in range(1, qty):
                req('POST', '/order_equipment', {'order_id': l['order_id'], 'equipment_type_id': TID,
                    'equipment_instance_id': ids[i], 'quantity': 1, 'unit_price': l['unit_price'],
                    'line_total': per, 'note': note + ' [tách dòng]'}, headers=HMIN)
            print(f"  {o['order_code']} {'ht' if o['completed_at'] else 'mở'} {qty} máy, giữ {total:,.0f}")
            continue
        st2, r = req('PATCH', f"/order_equipment?id=eq.{l['id']}", body, headers=HMIN)
        print(f"  {o['order_code']} gắn {st2}, {total:,.0f}")
    print(f'=> xong {len(lines)} dòng')
if __name__ == '__main__':
    map_orphans(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None)
