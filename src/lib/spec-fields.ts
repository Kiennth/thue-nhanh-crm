// Thông số có cấu trúc cho web (đề xuất CRM v2 §1a + spec_filter_standard,
// CEO "coi cái nào cần trước làm trước" 2026-10-09). Lưu ở
// website_products.spec_facets (jsonb) dạng { mã_trường: giá_trị }:
//   - num  : số thuần (hoặc mảng số khi máy có nhiều biến thể, vd bộ nhớ
//            128/256GB) — đơn vị cố định theo trường, web tự định dạng
//            "55 inch", "16GB", "4.000 lumen".
//   - enum : mã lựa chọn (mảng khi nhiều giá trị, vd thể loại game).
//   - text : chữ tự do (hãng, chip, GPU…).
// Bộ lọc web + 3 thông số trên thẻ đọc từ đây — KHÔNG đọc tên sản phẩm.
// Bộ lọc "Thành phố / Có sẵn ngày" của Grok KHÔNG làm: CEO 09/10 không cho
// khách xem tồn kho.
//
// FILE NÀY CÓ BẢN SAO Y HỆT ở web (Thuê Nhanh Web/src/lib/spec-fields.ts) —
// sửa một bên phải chép sang bên kia (mã trường là hợp đồng giữa 2 repo).

export type Bi = { vi: string; en: string };
export type SpecValue = number | string | (number | string)[];
export type SpecFacets = Record<string, SpecValue>;

type NumField = { kind: "num"; label: Bi; unit: string; tight?: boolean; min: number; max: number; step?: number; bands?: number[] };
type EnumField = { kind: "enum"; label: Bi; options: Record<string, Bi>; multi?: boolean };
type TextField = { kind: "text"; label: Bi; placeholder?: string };
export type SpecField = NumField | EnumField | TextField;

const YES_NO = (yes: Bi, no: Bi): Record<string, Bi> => ({ co: yes, khong: no });

export const SPEC_FIELDS: Record<string, SpecField> = {
  hang: { kind: "text", label: { vi: "Hãng", en: "Brand" }, placeholder: "Apple" },
  chip: { kind: "text", label: { vi: "Chip / CPU", en: "Chip / CPU" }, placeholder: "M3 Pro · Core i7 · Ryzen 7" },
  ram_gb: { kind: "num", label: { vi: "RAM", en: "RAM" }, unit: "GB", tight: true, min: 1, max: 512 },
  gpu: { kind: "text", label: { vi: "GPU", en: "GPU" }, placeholder: "GPU 10 nhân · RTX 4060" },
  man_hinh_inch: { kind: "num", label: { vi: "Màn hình", en: "Screen" }, unit: "inch", min: 1, max: 40, step: 0.1 },
  bo_nho_gb: { kind: "num", label: { vi: "Bộ nhớ", en: "Storage" }, unit: "GB", tight: true, min: 1, max: 8192 },
  camera_mp: { kind: "num", label: { vi: "Camera", en: "Camera" }, unit: "MP", min: 1, max: 400 },
  kich_thuoc_inch: { kind: "num", label: { vi: "Kích thước", en: "Size" }, unit: "inch", min: 10, max: 300 },
  do_phan_giai: {
    kind: "enum",
    label: { vi: "Độ phân giải", en: "Resolution" },
    options: {
      "8k": { vi: "8K", en: "8K" },
      "5k": { vi: "5K+", en: "5K+" },
      "4k": { vi: "4K", en: "4K" },
      "2k": { vi: "2K", en: "2K" },
      fhd: { vi: "Full HD", en: "Full HD" },
      hd: { vi: "HD", en: "HD" },
    },
  },
  cam_ung: { kind: "enum", label: { vi: "Cảm ứng", en: "Touch" }, options: YES_NO({ vi: "Cảm ứng", en: "Touch" }, { vi: "Không cảm ứng", en: "Non-touch" }) },
  chan_gia: {
    kind: "enum",
    label: { vi: "Kiểu chân", en: "Stand" },
    options: {
      chan_di_dong: { vi: "Chân di động", en: "Mobile stand" },
      chan_de: { vi: "Chân đế", en: "Table stand" },
      treo_tuong: { vi: "Treo tường", en: "Wall mount" },
    },
  },
  do_sang_lumen: { kind: "num", label: { vi: "Độ sáng", en: "Brightness" }, unit: "lumen", min: 50, max: 50000, bands: [3000, 4000] },
  loai: {
    kind: "enum",
    label: { vi: "Loại", en: "Type" },
    options: {
      loa_di_dong: { vi: "Loa di động", en: "Portable speaker" },
      loa_party: { vi: "Loa party / karaoke", en: "Party / karaoke speaker" },
      loa_nghe_nhac: { vi: "Loa nghe nhạc", en: "Home speaker" },
      loa_kiem_am: { vi: "Loa kiểm âm", en: "Studio monitor" },
      loa_tro_giang: { vi: "Loa trợ giảng", en: "Voice amplifier" },
      micro_khong_day: { vi: "Micro không dây", en: "Wireless mic" },
      micro_cai_ao: { vi: "Micro cài áo", en: "Lavalier mic" },
      micro_co_day: { vi: "Micro có dây", en: "Wired mic" },
      tai_nghe: { vi: "Tai nghe", en: "Headphones" },
      amply_mixer: { vi: "Amply / mixer", en: "Amp / mixer" },
      soundcard: { vi: "Soundcard", en: "Audio interface" },
      may_ghi_am: { vi: "Máy ghi âm", en: "Recorder" },
      combo: { vi: "Combo trọn bộ", en: "Bundle" },
      phu_kien: { vi: "Phụ kiện", en: "Accessory" },
      may_anh: { vi: "Máy ảnh", en: "Camera" },
      may_quay: { vi: "Máy quay", en: "Camcorder" },
      action_cam: { vi: "Action cam", en: "Action cam" },
      camera_360: { vi: "Camera 360", en: "360 camera" },
      gimbal: { vi: "Gimbal / chống rung", en: "Gimbal" },
      livestream: { vi: "Livestream", en: "Livestream" },
      chup_lay_lien: { vi: "Chụp lấy liền", en: "Instant camera" },
      may_in_anh: { vi: "Máy in ảnh", en: "Photo printer" },
      pb_co_dien: { vi: "Photobooth cổ điển", en: "Classic photobooth" },
      pb_ai: { vi: "Photobooth AI", en: "AI photobooth" },
      pb_360: { vi: "Photobooth 360", en: "360 photobooth" },
      ban: { vi: "Bàn", en: "Table" },
      ghe: { vi: "Ghế", en: "Chair" },
    },
  },
  cong_suat_w: { kind: "num", label: { vi: "Công suất", en: "Power" }, unit: "W", min: 1, max: 20000, bands: [100, 300, 1000] },
  nguon: { kind: "enum", label: { vi: "Nguồn", en: "Power source" }, options: { pin: { vi: "Có pin", en: "Battery" }, dien: { vi: "Cắm điện", en: "Mains" } } },
  video: {
    kind: "enum",
    label: { vi: "Video", en: "Video" },
    options: {
      "8k": { vi: "8K", en: "8K" },
      "5k": { vi: "5K+", en: "5K+" },
      "4k": { vi: "4K", en: "4K" },
      "2k": { vi: "2,7K", en: "2.7K" },
      fhd: { vi: "Full HD", en: "Full HD" },
    },
  },
  cam_bien: { kind: "text", label: { vi: "Cảm biến", en: "Sensor" }, placeholder: "Full-frame 33 MP" },
  in_anh: { kind: "enum", label: { vi: "In ảnh", en: "Prints" }, options: YES_NO({ vi: "In ảnh tại chỗ", en: "On-site prints" }, { vi: "Không in ảnh", en: "No prints" }) },
  he_may: {
    kind: "enum",
    label: { vi: "Máy", en: "Console" },
    options: {
      ps5: { vi: "PS5", en: "PS5" },
      ps4: { vi: "PS4", en: "PS4" },
      xbox: { vi: "Xbox", en: "Xbox" },
      switch2: { vi: "Switch 2", en: "Switch 2" },
      switch: { vi: "Switch", en: "Switch" },
      pc: { vi: "PC", en: "PC" },
    },
    multi: true,
  },
  so_tay_cam: { kind: "num", label: { vi: "Tay cầm", en: "Controllers" }, unit: "tay cầm", min: 0, max: 8 },
  the_loai: {
    kind: "enum",
    label: { vi: "Thể loại", en: "Genre" },
    multi: true,
    options: {
      hanh_dong: { vi: "Hành động", en: "Action" },
      phieu_luu: { vi: "Phiêu lưu", en: "Adventure" },
      nhap_vai: { vi: "Nhập vai", en: "RPG" },
      doi_khang: { vi: "Đối kháng", en: "Fighting" },
      party: { vi: "Party", en: "Party" },
      the_thao: { vi: "Thể thao", en: "Sports" },
      dua_xe: { vi: "Đua xe", en: "Racing" },
      mo_phong: { vi: "Mô phỏng", en: "Simulation" },
      ban_sung: { vi: "Bắn súng", en: "Shooter" },
      di_canh: { vi: "Đi cảnh", en: "Platformer" },
      giai_do: { vi: "Giải đố", en: "Puzzle" },
      chien_thuat: { vi: "Chiến thuật", en: "Strategy" },
      am_nhac: { vi: "Âm nhạc", en: "Music" },
    },
  },
  so_nguoi: { kind: "num", label: { vi: "Người chơi (1 máy)", en: "Players (1 console)" }, unit: "người", min: 1, max: 12 },
  dung_luong_wh: { kind: "num", label: { vi: "Dung lượng", en: "Capacity" }, unit: "Wh", min: 10, max: 50000 },
  chat_lieu: { kind: "text", label: { vi: "Chất liệu", en: "Material" }, placeholder: "Mặt gỗ, chân inox" },
  thong_so: { kind: "text", label: { vi: "Thông số chính", en: "Key spec" }, placeholder: "768 Wh · 20.000 mAh · 5 tầng" },
  // B4 (Grok CRM 09/10, spec_filter_standard.csv): trường chi tiết cho khối
  // "Thông số nổi bật" trên trang sản phẩm — không phải bộ lọc.
  dong_may: { kind: "text", label: { vi: "Dòng máy", en: "Model line" }, placeholder: "MacBook Air M3, 2024" },
  model: { kind: "text", label: { vi: "Model", en: "Model" }, placeholder: "vd: A7 IV · EON One Compact" },
  o_cung: { kind: "text", label: { vi: "Ổ cứng", en: "Storage" }, placeholder: "512GB SSD" },
  cong_ket_noi: { kind: "text", label: { vi: "Cổng kết nối", en: "Ports" }, placeholder: "HDMI ×2, USB-C" },
  khong_day: { kind: "text", label: { vi: "Kết nối không dây", en: "Wireless" }, placeholder: "Wi-Fi 6E, Bluetooth 5.3" },
  pin: { kind: "text", label: { vi: "Pin", en: "Battery" }, placeholder: "52,6 Wh · tới 18 giờ" },
  he_dieu_hanh: { kind: "text", label: { vi: "Hệ điều hành", en: "OS" }, placeholder: "macOS · Android 13" },
  trong_luong_kg: { kind: "num", label: { vi: "Trọng lượng", en: "Weight" }, unit: "kg", min: 0.01, max: 1000, step: 0.01 },
  di_kem: { kind: "text", label: { vi: "Đi kèm", en: "Included" }, placeholder: "Cáp sạc, ốp" },
  kich_thuoc_may: { kind: "text", label: { vi: "Kích thước máy", en: "Dimensions" }, placeholder: "1490 × 900 × 90 mm" },
  kich_thuoc: { kind: "text", label: { vi: "Kích thước", en: "Size" }, placeholder: "Ø60 × 110 cm" },
  tam_nen: { kind: "text", label: { vi: "Tấm nền", en: "Panel" }, placeholder: "IPS" },
  do_sang_nits: { kind: "num", label: { vi: "Độ sáng", en: "Brightness" }, unit: "nits", min: 50, max: 10000 },
  khoang_chieu: { kind: "text", label: { vi: "Khoảng chiếu", en: "Throw distance" }, placeholder: "3 m ≈ 100 inch" },
  man_chieu: { kind: "text", label: { vi: "Màn chiếu đi kèm", en: "Screen included" }, placeholder: "100 inch chân đứng" },
  micro_di_kem: { kind: "text", label: { vi: "Micro đi kèm", en: "Mics included" }, placeholder: "2 micro không dây" },
  phu_hop: { kind: "text", label: { vi: "Phù hợp", en: "Suitable for" }, placeholder: "≤ 100 khách" },
  so_kenh: { kind: "num", label: { vi: "Số kênh", en: "Channels" }, unit: "kênh", min: 1, max: 10 },
  tam_phat_m: { kind: "num", label: { vi: "Tầm phát", en: "Range" }, unit: "m", min: 1, max: 2000 },
  bo_phat: { kind: "text", label: { vi: "Bộ phát", en: "Transmitter" }, placeholder: "1 bộ phát / kênh" },
  cach_dung: { kind: "text", label: { vi: "Cách dùng", en: "Use cases" }, placeholder: "Party, Talk, Tour" },
  ong_kinh: { kind: "text", label: { vi: "Ống kính đi kèm", en: "Lens included" }, placeholder: "28–70 mm f/3.5–5.6" },
  the_nho_pin: { kind: "text", label: { vi: "Thẻ nhớ / pin", en: "Card / batteries" }, placeholder: "2 pin, thẻ 128GB" },
  dien_tich: { kind: "text", label: { vi: "Diện tích đặt máy", en: "Footprint" }, placeholder: "2 × 2 m" },
  nhan_su: { kind: "text", label: { vi: "Nhân sự đi kèm", en: "Staff included" }, placeholder: "1 kỹ thuật" },
  nguon_dien: { kind: "text", label: { vi: "Nguồn điện", en: "Power" }, placeholder: "220V, 1 ổ" },
  game_di_kem: { kind: "text", label: { vi: "Game đi kèm", en: "Games included" }, placeholder: "5 game" },
  man_hinh_di_kem: { kind: "text", label: { vi: "Màn hình đi kèm", en: "Display included" }, placeholder: "Không" },
  mau: { kind: "text", label: { vi: "Màu", en: "Colour" }, placeholder: "Trắng" },
  so_cho: { kind: "num", label: { vi: "Số chỗ", en: "Seats" }, unit: "người", min: 1, max: 200 },
};

// Nhóm hàng: các ô nhập trong CRM (fields), bộ lọc riêng trên web (filters,
// đúng thứ tự Grok; Giá/ngày luôn đứng cuối, do web tự thêm) và 3 thông số
// trên thẻ (card).
export interface SpecGroup {
  label: string;
  fields: string[];
  filters: string[];
  card: string[];
}

// fields theo đúng thứ tự cột "order" của spec_filter_standard.csv (B4);
// filters/card giữ như đã chạy trên web.
export const SPEC_GROUPS: Record<string, SpecGroup> = {
  laptop: { label: "Laptop & MacBook", fields: ["hang", "dong_may", "chip", "ram_gb", "o_cung", "man_hinh_inch", "gpu", "cong_ket_noi", "khong_day", "pin", "he_dieu_hanh", "trong_luong_kg"], filters: ["hang", "chip", "ram_gb"], card: ["man_hinh_inch", "chip", "ram_gb"] },
  pc: { label: "PC, Mac mini & Mac Studio", fields: ["hang", "dong_may", "chip", "ram_gb", "o_cung", "gpu", "man_hinh_inch", "cong_ket_noi", "di_kem", "kich_thuoc_may", "trong_luong_kg"], filters: ["hang", "chip", "ram_gb"], card: ["chip", "ram_gb", "gpu"] },
  screen: { label: "Màn hình & màn tương tác", fields: ["hang", "kich_thuoc_inch", "do_phan_giai", "cam_ung", "tam_nen", "he_dieu_hanh", "cong_ket_noi", "chan_gia", "kich_thuoc_may", "trong_luong_kg"], filters: ["kich_thuoc_inch", "cam_ung", "do_phan_giai"], card: ["kich_thuoc_inch", "do_phan_giai", "cam_ung"] },
  tv: { label: "TV & màn LED", fields: ["hang", "kich_thuoc_inch", "do_phan_giai", "do_sang_nits", "cong_ket_noi", "chan_gia", "kich_thuoc_may", "trong_luong_kg"], filters: ["kich_thuoc_inch", "do_phan_giai", "chan_gia"], card: ["kich_thuoc_inch", "do_phan_giai", "chan_gia"] },
  projector: { label: "Máy chiếu", fields: ["hang", "do_sang_lumen", "do_phan_giai", "khoang_chieu", "cong_ket_noi", "man_chieu", "trong_luong_kg"], filters: ["do_sang_lumen", "do_phan_giai"], card: ["do_sang_lumen", "do_phan_giai", "hang"] },
  audio: { label: "Âm thanh", fields: ["hang", "model", "loai", "cong_suat_w", "nguon", "pin", "micro_di_kem", "cong_ket_noi", "phu_hop", "trong_luong_kg"], filters: ["loai", "hang", "nguon"], card: ["loai", "cong_suat_w", "nguon"] },
  silent: { label: "Tai nghe silent", fields: ["hang", "so_kenh", "tam_phat_m", "pin", "bo_phat", "cach_dung"], filters: ["hang"], card: ["so_kenh", "tam_phat_m", "pin"] },
  phone: { label: "Điện thoại & tablet", fields: ["hang", "model", "man_hinh_inch", "bo_nho_gb", "ram_gb", "camera_mp", "chip", "pin", "di_kem"], filters: ["hang", "bo_nho_gb", "man_hinh_inch"], card: ["man_hinh_inch", "bo_nho_gb", "camera_mp"] },
  camera: { label: "Máy ảnh, máy quay & livestream", fields: ["hang", "model", "loai", "cam_bien", "video", "ong_kinh", "the_nho_pin", "trong_luong_kg"], filters: ["loai", "hang", "video"], card: ["loai", "video", "cam_bien"] },
  photobooth: { label: "Photobooth", fields: ["loai", "in_anh", "dien_tich", "nhan_su", "nguon_dien"], filters: ["loai", "in_anh"], card: ["loai", "in_anh", "dien_tich"] },
  console: { label: "Máy game", fields: ["hang", "model", "he_may", "so_tay_cam", "game_di_kem", "man_hinh_di_kem", "di_kem"], filters: ["he_may", "so_tay_cam"], card: ["he_may", "so_tay_cam"] },
  game: { label: "Thẻ game", fields: ["he_may", "the_loai", "so_nguoi"], filters: ["he_may", "the_loai", "so_nguoi"], card: ["he_may", "the_loai", "so_nguoi"] },
  furniture: { label: "Bàn ghế sự kiện", fields: ["loai", "kich_thuoc", "chat_lieu", "mau", "so_cho", "thong_so"], filters: ["loai"], card: ["loai", "thong_so", "chat_lieu"] },
  other: { label: "Nhóm khác", fields: ["hang", "model", "thong_so", "di_kem", "dung_luong_wh", "cong_suat_w"], filters: ["hang"], card: ["hang", "thong_so"] },
};

// Danh mục web (slug danh mục con) → nhóm. Danh mục không có trong bảng →
// "other".
const GROUP_BY_CATEGORY: Record<string, string> = {
  "thue-macbook-pro": "laptop",
  "thue-macbook-air": "laptop",
  "thue-laptop": "laptop",
  "thue-laptop-gaming": "laptop",
  "thue-gaming-pc-laptop": "laptop",
  "thue-mac-mini-mac-studio": "pc",
  "thue-pc": "pc",
  "thue-imac": "pc",
  "thue-man-hinh": "screen",
  "cho-thue-man-hinh-tuong-tac": "screen",
  "thue-standee-man-quang-cao": "screen",
  "thue-tv-trinh-chieu": "tv",
  "thue-may-chieu": "projector",
  "thiet-bi-trinh-chieu": "projector",
  "thue-loa-nghe-nhac": "audio",
  "thue-loa": "audio",
  "thue-tai-nghe": "audio",
  "thue-micro-co-day": "audio",
  "thue-micro-khong-day": "audio",
  "thue-micro-cai-ao-khong-day": "audio",
  "thue-combo-podcast": "audio",
  "thue-may-ghi-am": "audio",
  "thue-amply-dj-hifi": "audio",
  "thue-soundcard": "audio",
  "thue-loa-kiem-am": "audio",
  "thue-loa-tro-giang": "audio",
  "thue-iphone": "phone",
  "thue-dien-thoai-android": "phone",
  "thue-dien-thoai-gap": "phone",
  "thue-ipad": "phone",
  "thue-may-tinh-bang": "phone",
  "thue-action-cam": "camera",
  "thue-camera-360": "camera",
  "thue-thiet-bi-quay-chup": "camera",
  "thue-tay-cam-chong-rung": "camera",
  "thue-may-quay-chong-rung": "camera",
  "instant-camera": "camera",
  "thue-may-anh": "camera",
  "thue-live-stream": "camera",
  "thue-may-in-anh": "camera",
  "thue-photobooth": "photobooth",
  "thue-playstation": "console",
  "thue-xbox": "console",
  "thue-nintendo": "console",
  "thue-the-game-nintendo": "game",
  "ban-ghe": "furniture",
};

// Số thông số tối thiểu để trang sản phẩm có khối "Thông số nổi bật" (B4):
// 4, hoặc đủ hết trường với nhóm ít trường (Thẻ game có 3).
export const MIN_SPECS = 4;
export const minSpecsFor = (group: SpecGroup) => Math.min(MIN_SPECS, group.fields.length);

// productSlug: tai nghe silent (SSounds) nằm chung danh mục Tai nghe nhưng
// thông số khác hẳn (số kênh, tầm phát) → nhận theo slug sản phẩm.
export const specGroupKey = (categorySlug: string | null | undefined, productSlug?: string | null) =>
  (productSlug && /silent/.test(productSlug) ? "silent" : null) ||
  (categorySlug && GROUP_BY_CATEGORY[categorySlug]) ||
  "other";
export const specGroupOf = (categorySlug: string | null | undefined, productSlug?: string | null) =>
  SPEC_GROUPS[specGroupKey(categorySlug, productSlug)];

const asList = (v: SpecValue | undefined): (number | string)[] =>
  v == null || v === "" ? [] : Array.isArray(v) ? v : [v];

// "13,6" · "4.000" — thập phân dấu phẩy, nghìn dấu chấm (chuẩn Grok); EN
// ngược lại.
function formatNumber(n: number, locale: "vi" | "en") {
  return n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 2 });
}

const UNIT_EN: Record<string, string> = { "tay cầm": "controllers", người: "players", kênh: "channels" };

// 1 giá trị (đã tách khỏi mảng) → chữ hiển thị.
export function formatSpecValue(code: string, v: number | string, locale: "vi" | "en" = "vi"): string {
  const f = SPEC_FIELDS[code];
  if (!f) return String(v);
  if (f.kind === "num") {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    const unit = locale === "en" ? (UNIT_EN[f.unit] ?? f.unit) : f.unit;
    if (code === "bo_nho_gb" && n >= 1024 && n % 1024 === 0) return `${n / 1024}TB`;
    if (code === "so_cho" && locale === "en") return `${formatNumber(n, locale)} ${n === 1 ? "seat" : "seats"}`;
    if (code === "so_nguoi") return locale === "en" ? `${n === 1 ? "1 player" : `1–${n} players`}` : n === 1 ? "1 người" : `1–${n} người`;
    return f.tight ? `${formatNumber(n, locale)}${unit}` : `${formatNumber(n, locale)} ${unit}`;
  }
  if (f.kind === "enum") return f.options[String(v)]?.[locale] ?? String(v);
  return String(v);
}

// Cả giá trị của 1 trường (mảng → "128GB / 256GB").
export function formatSpec(code: string, v: SpecValue | undefined, locale: "vi" | "en" = "vi"): string {
  return asList(v)
    .map((x) => formatSpecValue(code, x, locale))
    .join(" / ");
}

export const specValues = asList;

// Kiểm tra + chuẩn hoá dữ liệu nhập từ CRM: bỏ mã lạ, số ngoài khoảng hợp
// lệ (chặn lỗi "00 inch"), lựa chọn không có trong danh sách. Trả lỗi đầu
// tiên (để báo người nhập) hoặc bản đã sạch.
export function cleanSpecFacets(input: unknown): { ok: true; value: SpecFacets } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Thông số không hợp lệ" };
  const out: SpecFacets = {};
  for (const [code, raw] of Object.entries(input as Record<string, unknown>)) {
    const f = SPEC_FIELDS[code];
    if (!f) continue;
    const list = (Array.isArray(raw) ? raw : [raw]).filter((x) => x !== null && x !== undefined && x !== "");
    if (!list.length) continue;
    const vals: (number | string)[] = [];
    for (const x of list) {
      if (f.kind === "num") {
        const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
        if (!Number.isFinite(n) || n < f.min || n > f.max)
          return { ok: false, error: `${f.label.vi}: ${String(x)} ${f.unit} nằm ngoài khoảng ${f.min}–${f.max}` };
        // Trọng lượng 1,24 kg giữ 2 số lẻ; trường khác 1 số lẻ.
        const scale = f.step !== undefined && f.step < 0.1 ? 100 : 10;
        vals.push(Math.round(n * scale) / scale);
      } else if (f.kind === "enum") {
        if (!(String(x) in f.options)) return { ok: false, error: `${f.label.vi}: lựa chọn "${String(x)}" không có` };
        vals.push(String(x));
      } else {
        const s = String(x).trim().slice(0, 80);
        if (s) vals.push(s);
      }
    }
    if (!vals.length) continue;
    out[code] = vals.length === 1 && !(f.kind === "enum" && f.multi) ? vals[0] : vals;
  }
  return { ok: true, value: out };
}
