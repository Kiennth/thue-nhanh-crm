// Theme theo mùa (CEO 10/10: Halloween) — bật bằng thuộc tính data-season trên
// <html>, đặt bởi 1 đoạn script nhỏ chạy trước khi vẽ trang nên trang đã lưu
// cache vẫn tự tắt đúng hạn (không phải nhớ gỡ, không phải xoá cache). Màu và
// trang trí nằm ở globals.css (khối html[data-season="halloween"]) + các phần tử
// class "season-only". Hết mùa: để nguyên, quá hạn tự tắt; mùa sau đổi key/hạn.
export const SEASON = {
  key: "halloween",
  // Tự tắt lúc 00:00 01/11/2026 giờ Việt Nam.
  until: "2026-11-01T00:00:00+07:00",
} as const;

export const SEASON_SCRIPT = `try{if(Date.now()<Date.parse("${SEASON.until}"))document.documentElement.dataset.season="${SEASON.key}"}catch(e){}`;
