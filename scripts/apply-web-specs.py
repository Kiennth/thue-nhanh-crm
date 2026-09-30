#!/usr/bin/env python3
"""Gắn "Thông số kỹ thuật" chuẩn (form thống nhất CEO chốt 2026-10-01) vào
mô tả sản phẩm web.

Đầu vào: file JSON mảng {slug, specs_vi: [[nhãn, giá trị]...], specs_en: [...]}
(do agent tra web hãng/Google tạo). Với mỗi SP: bỏ các mục cũ có heading
kiểu Cấu hình / Thông số / Specs / Kích thước / Tương thích trong
description_html (và _en nếu có), chèn 1 mục "<h2>Thông số kỹ thuật</h2>"
dạng <li><strong>Nhãn:</strong> Giá trị</li> — web tự hiện thành bảng
nhãn-giá trị. Bản mô tả cũ được lưu vào file backup cạnh file đầu vào.

Dùng:  python3 scripts/apply-web-specs.py <specs.json> [--dry]
"""
import html, json, re, sys, urllib.parse, urllib.request

ROOT = "/Users/nguyentrungkien/Documents/Thuê Nhanh CRM"
env = {}
for line in open(f"{ROOT}/.env.production"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        env.setdefault(k, v.strip('"'))
U, K = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]


def req(method, path, body=None):
    r = urllib.request.Request(
        U + "/rest/v1/" + urllib.parse.quote(path, safe="/?=&*,().:!"),
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json", "Prefer": "return=representation"},
    )
    return json.load(urllib.request.urlopen(r))


SPEC_HEAD = re.compile(r"c[ấa]u\s*h[ìi]nh|th[ôo]ng\s*s[ốo]|specs?|specification|configuration|k[íi]ch\s*th[ưu][ớo]c|t[ưu][ơo]ng\s*th[íi]ch|dimensions", re.I)


def strip_spec_sections(desc):
    """Bỏ các mục có heading thông số (heading + thân tới heading kế)."""
    if not desc:
        return ""
    parts = re.split(r"(<h[23][^>]*>[\s\S]*?</h[23]>)", desc)
    out, skip = [], False
    for part in parts:
        m = re.match(r"<h[23][^>]*>([\s\S]*?)</h[23]>", part)
        if m:
            heading = re.sub(r"<[^>]+>|&nbsp;", " ", m.group(1))
            skip = bool(SPEC_HEAD.search(heading))
            if skip:
                continue
        elif skip:
            continue
        out.append(part)
    return "".join(out).strip()


def spec_block(title, rows):
    lis = "".join(f"<li><strong>{html.escape(l)}:</strong> {html.escape(v)}</li>" for l, v in rows if l and v)
    return f"<h2>{title}</h2><ul>{lis}</ul>"


def main():
    src = sys.argv[1]
    dry = "--dry" in sys.argv
    items = json.load(open(src))
    backup = []
    done = 0
    for it in items:
        rows_vi, rows_en = it.get("specs_vi") or [], it.get("specs_en") or []
        if not rows_vi:
            continue
        found = req("GET", f"website_products?select=id,description_html,description_html_en&slug=eq.{it['slug']}")
        if not found:
            print("KHÔNG THẤY", it["slug"])
            continue
        p = found[0]
        backup.append(p)
        vi = (strip_spec_sections(p["description_html"]) + spec_block("Thông số kỹ thuật", rows_vi)).strip()
        body = {"description_html": vi}
        if p["description_html_en"] and rows_en:
            body["description_html_en"] = (strip_spec_sections(p["description_html_en"]) + spec_block("Specifications", rows_en)).strip()
        elif not p["description_html"] and rows_en:
            # SP chưa có mô tả nào: tạo luôn bản EN chỉ gồm thông số.
            body["description_html_en"] = spec_block("Specifications", rows_en)
        if not dry:
            req("PATCH", f"website_products?id=eq.{p['id']}", body)
        done += 1
    json.dump(backup, open(src.replace(".json", ".backup.json"), "w"), ensure_ascii=False)
    print(f"{'(chạy thử) ' if dry else ''}đã gắn thông số cho {done} SP; backup: {src.replace('.json', '.backup.json')}")


main()
