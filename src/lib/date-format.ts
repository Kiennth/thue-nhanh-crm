// Cloudflare Workers chạy giờ hệ thống UTC — Intl.DateTimeFormat không chỉ
// định rõ timeZone sẽ tự lấy giờ hệ thống (UTC), lệch 7 tiếng so với giờ VN
// hiển thị cho người dùng. Mọi Intl.DateTimeFormat trong app phải truyền
// timeZone: VN_TIME_ZONE.
export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
