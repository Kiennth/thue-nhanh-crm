#!/usr/bin/env python3
"""Điền sẵn website_products.spec_facets (thông số lọc web — lib/spec-fields.ts)
từ mục "Thông số kỹ thuật" có sẵn trong mô tả (dòng <li><strong>Nhãn:</strong>
Giá trị</li>), tag và danh mục. CEO 2026-10-09 (đề xuất CRM v2 §1a).

Chỉ điền trường còn TRỐNG — không đè giá trị nhân viên đã sửa tay trong CRM.
Kích thước màn hình chỉ lấy từ dòng thông số / tag "55 inch", không đọc tên
(chuẩn Grok: lỗi "00 inch", "4 inch" Zoom H8 sinh ra từ đọc tên).

Dùng:  python3 scripts/backfill-spec-facets.py            # chạy thử, ghi file xem trước
       python3 scripts/backfill-spec-facets.py --apply    # ghi DB (tuần tự)
"""
import html, json, re, sys, csv, collections
from importlib.machinery import SourceFileLoader

ROOT = "/Users/nguyentrungkien/Documents/Thuê Nhanh CRM"
m = SourceFileLoader("mol", f"{ROOT}/scripts/map-orphan-lines.py").load_module()
APPLY = "--apply" in sys.argv
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "/tmp/spec-facets-preview"

# Khớp GROUP_BY_CATEGORY trong src/lib/spec-fields.ts.
GROUP_BY_CATEGORY = {
    "thue-macbook-pro": "laptop", "thue-macbook-air": "laptop", "thue-laptop": "laptop",
    "thue-laptop-gaming": "laptop", "thue-gaming-pc-laptop": "laptop",
    "thue-mac-mini-mac-studio": "pc", "thue-pc": "pc", "thue-imac": "pc",
    "thue-man-hinh": "screen", "cho-thue-man-hinh-tuong-tac": "screen", "thue-standee-man-quang-cao": "screen",
    "thue-tv-trinh-chieu": "tv", "thue-may-chieu": "projector", "thiet-bi-trinh-chieu": "projector",
    "thue-loa-nghe-nhac": "audio", "thue-loa": "audio", "thue-tai-nghe": "audio", "thue-micro-co-day": "audio",
    "thue-micro-khong-day": "audio", "thue-micro-cai-ao-khong-day": "audio", "thue-combo-podcast": "audio",
    "thue-may-ghi-am": "audio", "thue-amply-dj-hifi": "audio", "thue-soundcard": "audio",
    "thue-loa-kiem-am": "audio", "thue-loa-tro-giang": "audio",
    "thue-iphone": "phone", "thue-dien-thoai-android": "phone", "thue-dien-thoai-gap": "phone",
    "thue-ipad": "phone", "thue-may-tinh-bang": "phone",
    "thue-action-cam": "camera", "thue-camera-360": "camera", "thue-thiet-bi-quay-chup": "camera",
    "thue-tay-cam-chong-rung": "camera", "thue-may-quay-chong-rung": "camera", "instant-camera": "camera",
    "thue-may-anh": "camera", "thue-live-stream": "camera", "thue-may-in-anh": "camera",
    "thue-photobooth": "photobooth", "thue-playstation": "console", "thue-xbox": "console",
    "thue-nintendo": "console", "thue-the-game-nintendo": "game", "ban-ghe": "furniture",
}
FIELDS = {
    "laptop": ["hang", "chip", "ram_gb", "man_hinh_inch", "gpu"],
    "pc": ["hang", "chip", "ram_gb", "gpu", "man_hinh_inch"],
    "screen": ["hang", "kich_thuoc_inch", "do_phan_giai", "cam_ung", "chan_gia"],
    "tv": ["hang", "kich_thuoc_inch", "do_phan_giai", "chan_gia"],
    "projector": ["hang", "do_sang_lumen", "do_phan_giai"],
    "audio": ["hang", "loai", "cong_suat_w", "nguon"],
    "phone": ["hang", "man_hinh_inch", "bo_nho_gb", "camera_mp", "chip"],
    "camera": ["hang", "loai", "video", "cam_bien"],
    "photobooth": ["loai", "in_anh"],
    "console": ["hang", "he_may", "so_tay_cam"],
    "game": ["he_may", "the_loai", "so_nguoi"],
    "furniture": ["loai", "chat_lieu", "thong_so"],
    "other": ["hang", "thong_so", "dung_luong_wh", "cong_suat_w"],
}


def num(s):
    """'13,6' → 13.6 · '4.000' → 4000 · '1.300' → 1300."""
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        return int(s.replace(".", ""))
    v = float(s.replace(",", "."))
    return int(v) if v == int(v) else round(v, 1)


def spec_pairs(desc):
    mm = re.search(r"<h2>\s*Thông số kỹ thuật\s*</h2>(.*?)(<h2|$)", desc or "", re.S)
    out = {}
    if not mm:
        return out
    for lab, val in re.findall(r"<li>\s*<strong>([^<]{1,40}?):?\s*</strong>:?\s*(.*?)</li>", mm.group(1), re.S):
        lab = html.unescape(lab).strip().rstrip(":")
        out.setdefault(lab, html.unescape(re.sub(r"<[^>]+>", "", val)).strip())
    return out


def first(p, *labels):
    for lab in labels:
        for k, v in p.items():
            if k.lower() == lab.lower() and v:
                return v
    return None


def norm_chip(s):
    if not s:
        return None
    t = s
    mm = re.search(r"\bM([1-5])(\s*(Pro|Max|Ultra))?\b", t)
    if mm:
        return f"M{mm.group(1)}{(' ' + mm.group(3)) if mm.group(3) else ''}"
    mm = re.search(r"\bA(1\d|20)(\s*(Pro|Bionic|Fusion))?\b", t)
    if mm:
        return f"A{mm.group(1)}{' Pro' if mm.group(3) == 'Pro' else ''}"
    mm = re.search(r"Core\s*Ultra\s*([3579])", t, re.I)
    if mm:
        return f"Core Ultra {mm.group(1)}"
    mm = re.search(r"Core\s*i([3579])|\bi([3579])[- ]\d{4,5}|Intel\s*i([3579])\b", t, re.I)
    if mm:
        return f"Core i{mm.group(1) or mm.group(2) or mm.group(3)}"
    mm = re.search(r"Ryzen\s*(AI\s*)?([3579])", t, re.I)
    if mm:
        return f"Ryzen {mm.group(2)}"
    mm = re.search(r"Snapdragon\s*(8\s*(?:Elite|Gen\s*\d)|X\s*Elite|XR\d(?:\s*Gen\s*\d)?|\d{3})", t, re.I)
    if mm:
        return "Snapdragon " + re.sub(r"\s+", " ", mm.group(1)).strip()
    mm = re.search(r"(Exynos|Dimensity|Helio|Tensor|Kirin)\s*([A-Z]?\d+\+?)", t, re.I)
    if mm:
        return f"{mm.group(1).capitalize()} {mm.group(2)}"
    return None


def ram_list(s):
    if not s:
        return []
    vals = [int(x) for x in re.findall(r"(\d+)\s*GB", s)]
    return sorted(set(v for v in vals if v <= 512))


def inch_values(s):
    """Màn hình nhiều cỡ '13 inch: 13,6 inch … · 15 inch: 15,3 inch' → [13.6, 15.3]."""
    if not s:
        return []
    s2 = re.sub(r"\b\d+(?:[.,]\d+)?\s*inch\s*:", "", s)  # bỏ nhãn "13 inch:"
    vals = [num(x) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:inch|\")", s2)]
    return vals


def resolution(s):
    if not s:
        return None
    t = s.upper()
    if re.search(r"\b8K\b|7680", t):
        return "8k"
    if re.search(r"\b[56]K\b|5120|6016", t):
        return "5k"
    if re.search(r"\b4K\b|UHD|3840|4096", t):
        return "4k"
    if re.search(r"\b2K\b|QHD|2560 ?[×X] ?1440|WQHD|UWQHD", t):
        return "2k"
    if re.search(r"FULL ?HD|1920 ?[×X] ?1080|\b1080P\b|WUXGA|1920 ?[×X] ?1200", t):
        return "fhd"
    if re.search(r"\bHD\b|1366|1280 ?[×X] ?(720|800)|WXGA", t):
        return "hd"
    return None


GENRES = [
    (r"hành động", "hanh_dong"), (r"phiêu lưu", "phieu_luu"), (r"nhập vai", "nhap_vai"),
    (r"đối kháng", "doi_khang"), (r"party", "party"), (r"thể thao", "the_thao"), (r"đua xe", "dua_xe"),
    (r"mô phỏng", "mo_phong"), (r"bắn súng", "ban_sung"), (r"đi cảnh", "di_canh"), (r"giải đố", "giai_do"),
    (r"chiến thuật", "chien_thuat"), (r"âm nhạc|nhịp điệu", "am_nhac"),
]


def audio_kind(cat, text):
    t = text.lower()
    if re.search(r"tay cầm|chắn gió|đế sạc|bộ chia|cáp|adapter|giá đỡ|interview", t) and cat != "thue-tai-nghe":
        return "phu_kien"
    fixed = {
        "thue-tai-nghe": "tai_nghe", "thue-micro-cai-ao-khong-day": "micro_cai_ao", "thue-loa-kiem-am": "loa_kiem_am",
        "thue-loa-tro-giang": "loa_tro_giang", "thue-amply-dj-hifi": "amply_mixer", "thue-soundcard": "soundcard",
        "thue-may-ghi-am": "may_ghi_am", "thue-combo-podcast": "combo",
    }
    if cat in fixed:
        return fixed[cat]
    if cat in ("thue-micro-khong-day", "thue-micro-co-day"):
        if "cài áo" in t:
            return "micro_cai_ao"
        return "micro_khong_day" if "không dây" in t else "micro_co_day"
    if re.search(r"party|karaoke|tháp|loa kéo|sân khấu|pa\b|array", t):
        return "loa_party"
    if re.search(r"để bàn|bookshelf|hi-?fi|loa thanh|soundbar|khung tranh|homepod|thông minh", t):
        return "loa_nghe_nhac"
    if re.search(r"di động|bluetooth|có pin|cầm tay|chống nước|du lịch", t):
        return "loa_di_dong"
    return "loa_nghe_nhac"


def camera_kind(cat, text):
    fixed = {
        "thue-action-cam": "action_cam", "thue-camera-360": "camera_360", "thue-tay-cam-chong-rung": "gimbal",
        "thue-may-quay-chong-rung": "may_quay", "thue-may-anh": "may_anh", "thue-live-stream": "livestream",
        "instant-camera": "chup_lay_lien", "thue-may-in-anh": "may_in_anh",
    }
    if cat in fixed:
        return fixed[cat]
    t = text.lower()
    if re.search(r"máy quay|camcorder|cinema", t):
        return "may_quay"
    if re.search(r"máy ảnh|mirrorless|dslr", t):
        return "may_anh"
    return "phu_kien"


def derive(p, cat, group):
    pairs = spec_pairs(p["description_html"])
    name = (p.get("name") or "") + " " + p["slug"].replace("-", " ")
    tags = p.get("tags") or []
    plain = html.unescape(re.sub(r"<[^>]+>", " ", p["description_html"] or ""))
    f = {}
    want = FIELDS[group]

    if "hang" in want:
        h = first(pairs, "Hãng", "Thương hiệu") or p.get("brand")
        if h:
            h = re.split(r"\s*[(/;]", h)[0].strip()
            if 1 < len(h) <= 30:
                f["hang"] = h
        elif re.search(r"macbook|imac|mac mini|mac studio|iphone|ipad|airpods|homepod", name, re.I):
            f["hang"] = "Apple"
    if "chip" in want:
        c = norm_chip(first(pairs, "CPU", "Chip", "Vi xử lý"))
        if not c:
            c = next((norm_chip(t) for t in tags if norm_chip(t)), None) or norm_chip(name)
        if c:
            f["chip"] = c
    if "ram_gb" in want:
        r = [int(x) for x in re.findall(r"(\d+)\s*GB[ -]RAM", name, re.I)][:1] if group in ("laptop", "pc") else []
        if not r:
            r = ram_list(first(pairs, "RAM"))
        if not r:
            r = [int(x) for t in tags for x in re.findall(r"^(\d+)GB RAM$", t)]
        if r:
            f["ram_gb"] = r[0] if len(r) == 1 else r
    if "gpu" in want:
        g = first(pairs, "Card đồ hoạ", "GPU")
        if g:
            mm = re.search(r"RTX\s*(\d{4})", g)
            nn = re.findall(r"(\d+)\s*(?:hoặc\s*(\d+)\s*)?nhân", g)
            if mm:
                f["gpu"] = f"RTX {mm.group(1)}"
            elif re.search(r"Radeon Pro\s*(\w+)", g):
                f["gpu"] = "Radeon Pro " + re.search(r"Radeon Pro\s*(\w+)", g).group(1)
            elif nn and "tới" not in g[:6]:
                a, b = nn[0]
                f["gpu"] = f"GPU {a}–{b} nhân" if b else f"GPU {a} nhân"
            elif re.search(r"Iris", g):
                f["gpu"] = "Intel Iris"
            elif re.search(r"Radeon", g):
                f["gpu"] = "Radeon tích hợp"
    if "man_hinh_inch" in want:
        v = inch_values(first(pairs, "Màn hình") or "")
        if not v:
            v = [num(x) for t in tags for x in re.findall(r"^(\d+(?:[.,]\d+)?) inch$", t)]
        v = [x for x in v if 3 <= x <= 40]
        if v:
            v = sorted(set(v))
            f["man_hinh_inch"] = v[0] if len(v) == 1 else v
    if "bo_nho_gb" in want:
        s = first(pairs, "Bộ nhớ", "Bộ nhớ trong", "RAM / Bộ nhớ", "Dung lượng")
        vals = []
        if s:
            s = re.sub(r"RAM\s*\d+\s*GB|\(RAM[^)]*\)|microSD[^,;]*", "", s)
            for n, u in re.findall(r"(\d+)\s*(GB|TB)", s):
                vals.append(int(n) * (1024 if u == "TB" else 1))
        if not vals:
            for t in tags:
                mm = re.fullmatch(r"(\d+)(GB|TB)", t)
                if mm:
                    vals.append(int(mm.group(1)) * (1024 if mm.group(2) == "TB" else 1))
        vals = sorted(set(v for v in vals if v >= 16))
        if vals:
            f["bo_nho_gb"] = vals[0] if len(vals) == 1 else vals
    if "camera_mp" in want:
        s = first(pairs, "Camera sau", "Camera")
        if s:
            mps = [int(x) for x in re.findall(r"(\d+)\s*MP", s)]
            if mps:
                f["camera_mp"] = max(mps)
    if "kich_thuoc_inch" in want:
        v = [x for x in inch_values(first(pairs, "Kích thước", "Màn hình") or "") if 10 <= x <= 300]
        if not v:
            v = [num(x) for t in tags for x in re.findall(r"^(\d{2,3}) inch$", t)]
        if v:
            f["kich_thuoc_inch"] = int(round(v[0]))
    if "do_phan_giai" in want:
        r = resolution(first(pairs, "Độ phân giải") or "") or resolution(first(pairs, "Màn hình", "Kích thước") or "")
        if not r:
            r = next((resolution(t) for t in tags if re.fullmatch(r"[248]K|Full HD", t)), None)
        if r:
            f["do_phan_giai"] = r
    if "cam_ung" in want:
        c = first(pairs, "Cảm ứng")
        if c:
            f["cam_ung"] = "co" if c.lower().startswith("có") else "khong"
        elif cat == "cho-thue-man-hinh-tuong-tac":
            f["cam_ung"] = "co"
        elif cat == "thue-man-hinh":
            f["cam_ung"] = "khong"
    if "chan_gia" in want:
        t = (first(pairs, "Chân / giá", "Chân", "Gồm") or "") + " " + plain
        if re.search(r"chân di động|bánh xe|chân đứng di động|xe đẩy", t, re.I):
            f["chan_gia"] = "chan_di_dong"
        elif re.search(r"treo tường", t, re.I) and not re.search(r"chân", t, re.I):
            f["chan_gia"] = "treo_tuong"
        elif re.search(r"chân đế", t, re.I):
            f["chan_gia"] = "chan_de"
    if "do_sang_lumen" in want:
        s = first(pairs, "Độ sáng") or ""
        mm = re.search(r"([\d.]+)\s*(?:ANSI\s*|ISO\s*|LED\s*)?lumen", s, re.I)
        if mm:
            f["do_sang_lumen"] = num(mm.group(1))
    if "loai" in want:
        text = (first(pairs, "Loại") or "") + " " + name
        if group == "audio":
            f["loai"] = audio_kind(cat, text)
        elif group == "camera":
            f["loai"] = camera_kind(cat, text)
        elif group == "photobooth":
            f["loai"] = "pb_360" if re.search(r"360|xoay", name, re.I) else "pb_ai" if re.search(r"\bAI\b", name, re.I) else "pb_co_dien"
        elif group == "furniture":
            f["loai"] = "ghe" if re.search(r"ghế", name, re.I) else "ban"
    if "cong_suat_w" in want:
        s = first(pairs, "Công suất") or ""
        mm = re.search(r"([\d.,]+)\s*W\b", s)
        if mm:
            try:
                f["cong_suat_w"] = num(mm.group(1).lstrip("~"))
            except ValueError:
                pass
    if "nguon" in want and f.get("loai", "").startswith("loa"):
        pin = first(pairs, "Pin")
        if pin and not re.match(r"không", pin, re.I):
            f["nguon"] = "pin"
        elif re.search(r"cắm điện|nguồn điện|220\s*V|AC", (first(pairs, "Loại", "Nguồn điện") or "") + " " + name, re.I):
            f["nguon"] = "dien"
    if "video" in want:
        s = first(pairs, "Quay video", "Video") or ""
        if re.search(r"\b8K", s):
            f["video"] = "8k"
        elif re.search(r"\b(5[.,]\d?K|5K|6K|5\.7K|11K)", s):
            f["video"] = "5k"
        elif re.search(r"\b4K", s):
            f["video"] = "4k"
        elif re.search(r"\b2[.,]7K", s):
            f["video"] = "2k"
        elif re.search(r"1080", s):
            f["video"] = "fhd"
    if "cam_bien" in want:
        s = first(pairs, "Cảm biến") or ""
        mm = re.search(r"(Full[- ]?frame|APS-C|Micro Four Thirds|1 inch|1/\d(?:[.,]\d+)?\s*inch)", s, re.I)
        mp = re.search(r"(\d+(?:[.,]\d)?)\s*MP", s)
        if mm:
            f["cam_bien"] = (mm.group(1).replace("Full frame", "Full-frame") + (f" {mp.group(1)} MP" if mp else "")).strip()
    if "in_anh" in want:
        f["in_anh"] = "co" if re.search(r"in ảnh|máy in|in tại chỗ", plain, re.I) else "khong"
    if "he_may" in want:
        s = (first(pairs, "Hệ máy") or "") + " " + (name if group == "console" else "")
        if group == "game":
            f["he_may"] = ["switch2"] if re.match(r"\s*Nintendo Switch 2", s) else ["switch"]
        else:
            hm = []
            if re.search(r"PS5|PlayStation 5", s, re.I):
                hm.append("ps5")
            elif re.search(r"PS4|PlayStation 4", s, re.I):
                hm.append("ps4")
            if re.search(r"xbox", s, re.I):
                hm.append("xbox")
            if re.search(r"switch[ -]2", s, re.I):
                hm.append("switch2")
            elif re.search(r"switch|nintendo", s, re.I):
                hm.append("switch")
            if hm:
                f["he_may"] = hm
    if "so_tay_cam" in want:
        mm = re.search(r"(\d)\s*tay c[ầa]m", (first(pairs, "Gồm") or "") + " " + name, re.I)
        if mm:
            f["so_tay_cam"] = int(mm.group(1))
    if "the_loai" in want:
        s = (first(pairs, "Thể loại") or "").lower()
        g = [code for rx, code in GENRES if re.search(rx, s)]
        if g:
            f["the_loai"] = g
    if "so_nguoi" in want:
        s = first(pairs, "Số người chơi") or ""
        mm = re.match(r"\s*1[–-](\d+)\s*người", s) or re.match(r"\s*(\d+)\s*người", s)
        if mm:
            f["so_nguoi"] = int(mm.group(1))
    if "dung_luong_wh" in want:
        mm = re.search(r"([\d.]+)\s*Wh", first(pairs, "Dung lượng") or "")
        if mm:
            f["dung_luong_wh"] = num(mm.group(1))
    if "chat_lieu" in want:
        c = first(pairs, "Chất liệu")
        if c:
            f["chat_lieu"] = c[:60]
    if "thong_so" in want:
        if f.get("dung_luong_wh"):
            pass  # thẻ đã có Wh qua thong_so dưới
        cands = []
        if f.get("dung_luong_wh"):
            cands.append(f"{f['dung_luong_wh']:,} Wh".replace(",", "."))
        for lab in ("Dung lượng", "Công suất", "Kích thước", "Tốc độ", "Phạm vi", "Màn hình"):
            v = first(pairs, lab)
            if v:
                short = re.split(r"[;(]|, (?=[a-zà-ỹ])", v)[0].strip()
                if 2 <= len(short) <= 40:
                    cands.append(short)
        if cands:
            f["thong_so"] = cands[0]
    return f, pairs


def main():
    st, cats = m.req("GET", "/website_categories", None, {"select": "id,slug", "limit": "1000"})
    cslug = {c["id"]: c["slug"] for c in cats}
    st, ps = m.req("GET", "/website_products", None, {
        "select": "id,slug,brand,tags,website_category_id,description_html,spec_facets",
        "is_published": "eq.true", "limit": "2000"})
    st, view = m.req("GET", "/website_products_public", None, {"select": "slug,name", "limit": "2000"})
    vname = {v["slug"]: v["name"] for v in view}
    for p in ps:
        p["name"] = vname.get(p["slug"], "")
    rows, stats = [], collections.defaultdict(collections.Counter)
    for p in ps:
        cat = cslug.get(p["website_category_id"])
        group = GROUP_BY_CATEGORY.get(cat, "other")
        derived, pairs = derive(p, cat, group)
        cur = p.get("spec_facets") or {}
        merged = {**derived, **cur}  # giữ giá trị đã sửa tay
        stats[group]["_total"] += 1
        for k in FIELDS[group]:
            if k in merged:
                stats[group][k] += 1
        rows.append({"id": p["id"], "slug": p["slug"], "name": p["name"], "cat": cat, "group": group,
                     "facets": merged, "changed": merged != cur})
    json.dump(rows, open(OUT + ".json", "w"), ensure_ascii=False, indent=1)
    with open(OUT + ".csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["group", "cat", "slug", "name", "facets"])
        for r in sorted(rows, key=lambda r: (r["group"], r["cat"] or "", r["slug"])):
            w.writerow([r["group"], r["cat"], r["slug"], r["name"], json.dumps(r["facets"], ensure_ascii=False)])
    for g, c in sorted(stats.items()):
        tot = c.pop("_total")
        print(f"{g:11} {tot:4} SP · " + " · ".join(f"{k} {c.get(k, 0)}" for k in FIELDS[g]))
    todo = [r for r in rows if r["changed"]]
    print(f"Cần ghi: {len(todo)} SP → xem {OUT}.csv")
    if APPLY:
        H = dict(m.HJ)
        ok = 0
        for r in todo:
            s, _ = m.req("PATCH", f"/website_products?id=eq.{r['id']}", {"spec_facets": r["facets"]}, None, H)
            if s in (200, 204):
                ok += 1
            else:
                print("LỖI", r["slug"], s, _)
        print(f"Đã ghi {ok}/{len(todo)}")


if __name__ == "__main__":
    main()
