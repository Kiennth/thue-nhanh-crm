#!/usr/bin/env python3
"""Điền bù ghi chú dòng (Booqable "extra information") cho đơn BQ đã import.

Trước 2026-09-30 script import bỏ lại ghi chú dưới từng dòng của Booqable
("Kèm Remote | Dây nguồn", địa chỉ + SĐT giao hàng...) nên đơn BQ trong CRM
không có — nhân viên phải mở Booqable mới biết giao đi đâu.

Cách khớp dòng BQ ↔ dòng CRM trong cùng đơn (CRM không lưu id dòng Booqable):
  1. dòng tự do: custom_name trùng tên sản phẩm / tiêu đề dòng BQ
  2. dòng đã gắn lại: note nội bộ chứa "«tên»" (mapper ghi lại tên gốc)
  3. dòng import khớp thẳng danh mục: tên loại hàng CRM == tên sản phẩm BQ
Chỉ ghi vào dòng CHƯA có extra_information (không đè ghi chú nhân viên đã sửa).

Dùng:  python3 scripts/backfill-booqable-line-notes.py [--all] [--dry]
  mặc định: chỉ đơn BQ còn mở (chưa hoàn tất/huỷ);  --all: mọi đơn BQ từ 06/2026.
"""
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

ROOT = "/Users/nguyentrungkien/Documents/Thuê Nhanh CRM"
DRY = "--dry" in sys.argv
ALL = "--all" in sys.argv


def load_env(path):
    env = {}
    for line in open(path):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            env[k] = v.strip('"')
    return env


prod = load_env(f"{ROOT}/.env.production")
local = load_env(f"{ROOT}/.env.local")
SB = prod["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1"
KEY = prod["SUPABASE_SERVICE_ROLE_KEY"]
BQ = local["BOOQABLE_API_URL"]
BQ_TOKEN = local["BOOQABLE_API_TOKEN"]
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def sb(method, path, body=None):
    req = urllib.request.Request(
        SB + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def bq(path):
    req = urllib.request.Request(
        BQ + path,
        headers={"Authorization": f"Bearer {BQ_TOKEN}", "User-Agent": UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError:
        return {}


def norm(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "").strip().lower())


def alnum(s):
    return re.sub(r"[\W_]+", "", norm(s))


product_names = {}


def product_name(item_id):
    if not item_id:
        return None
    if item_id not in product_names:
        data = bq(f"/products/{item_id}").get("data")
        product_names[item_id] = data["attributes"]["name"] if data else None
    return product_names[item_id]


orders = []
flt = "" if ALL else "&completed_at=is.null&cancelled_at=is.null"
for offset in range(0, 20000, 1000):
    page = sb(
        "GET",
        f"/orders?select=id,order_code&order_code=like.BQ*&order_date=gte.2026-06-01{flt}"
        f"&order=order_code&offset={offset}&limit=1000",
    )
    orders += page
    if len(page) < 1000:
        break
print(f"{len(orders)} đơn BQ cần rà ({'mọi đơn từ 06/2026' if ALL else 'đơn còn mở'})")

filled = 0
unmatched = []
orders_touched = 0
for order in orders:
    number = order["order_code"][2:]
    found = bq(f"/orders?filter[number]={number}").get("data") or []
    if not found:
        continue
    bq_lines = [
        l["attributes"]
        for l in bq(f"/lines?filter[order_id]={found[0]['id']}&page[size]=100").get("data", [])
        if (l["attributes"].get("extra_information") or "").strip() and not l["attributes"].get("archived")
    ]
    if not bq_lines:
        continue
    crm_lines = sb(
        "GET",
        f"/order_equipment?select=id,custom_name,note,extra_information,quantity,equipment_types(name)&order_id=eq.{order['id']}&order=position",
    )
    touched = False
    for bl in bq_lines:
        names = {norm(n) for n in (product_name(bl.get("item_id")), bl.get("title")) if n}
        # Khớp lỏng (dự phòng): bỏ dấu câu/khoảng trắng và phần biến thể sau
        # " - " (BQ "Smart TV 4K 50-inch - Samsung" ↔ CRM "Smart TV 4K 50 inch";
        # BQ "Playstation 5" ↔ CRM "Playstation 5 (kèm 2 tay cầm)").
        loose = set()
        for n in (product_name(bl.get("item_id")), bl.get("title")):
            if n:
                loose.add(alnum(n))
                loose.add(alnum(n.split(" - ")[0]))
        loose = {x for x in loose if len(x) >= 8}

        def exact(cl):
            quoted = {norm(m) for m in re.findall(r'"([^"]+)"', cl["note"] or "")}
            type_name = norm((cl.get("equipment_types") or {}).get("name"))
            return norm(cl["custom_name"]) in names or bool(quoted & names) or type_name in names

        def fuzzy(cl):
            t = alnum((cl.get("equipment_types") or {}).get("name") or cl["custom_name"] or "")
            return len(t) >= 8 and any(t == x or t in x or x in t for x in loose)

        free = [cl for cl in crm_lines if not cl["extra_information"]]
        candidates = [cl for cl in free if exact(cl)] or [cl for cl in free if fuzzy(cl)]
        # 1 dòng BQ chỉ "ăn" đúng phần của nó: máy serial CRM tách mỗi máy 1 dòng
        # (SL 1) → lấy số dòng bằng SL bên BQ; còn lại lấy 1 dòng. Nhờ vậy 2 dòng
        # BQ trùng tên nhưng ghi chú khác nhau được gán lần lượt, không đè nhau.
        serial_split = len(candidates) > 1 and all(cl["quantity"] == 1 for cl in candidates)
        take = candidates[: max(1, int(bl.get("quantity") or 1))] if serial_split else candidates[:1]
        ids = [cl["id"] for cl in take]
        for cl in take:
            cl["extra_information"] = bl["extra_information"].strip()
        if not ids:
            unmatched.append((order["order_code"], bl.get("title"), bl["extra_information"].strip()[:50]))
        if ids:
            filled += len(ids)
            touched = True
            if not DRY:
                sb(
                    "PATCH",
                    "/order_equipment?id=in.(" + ",".join(ids) + ")",
                    {"extra_information": bl["extra_information"].strip()},
                )
    if touched:
        orders_touched += 1
print(f"{'(chạy thử) ' if DRY else ''}đã điền {filled} dòng trên {orders_touched} đơn")
if unmatched:
    print(f"{len(unmatched)} dòng Booqable có ghi chú nhưng không khớp được dòng CRM (đã có ghi chú sẵn, hoặc dòng đã bị sửa/xoá):")
    for code, title, note in unmatched[:15]:
        print(f"  {code} | {title} | {note}")
