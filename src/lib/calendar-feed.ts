import "server-only";

// Link lịch iCal để "Subscribe" trên Google Calendar / iPhone (CEO 2026-10-04,
// học nút Subscribe của Booqable). Google/Apple tải link KHÔNG kèm đăng nhập
// nên link chứa mã ký HMAC theo từng nhân viên: lộ link chỉ lộ lịch của người
// đó, đổi CALENDAR_FEED_SECRET là vô hiệu hoá mọi link cũ.

function secret(): string {
  const s = process.env.CALENDAR_FEED_SECRET;
  if (!s) throw new Error("Thiếu CALENDAR_FEED_SECRET.");
  return s;
}

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(employeeId: string, purpose = "calendar"): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}:${employeeId}`));
  return b64url(sig).slice(0, 32);
}

// purpose tách mã của từng loại link (calendar = lịch giao/thu hồi; schedule
// = lịch làm việc cá nhân) — lộ link loại này không mở được loại kia.
export async function calendarFeedToken(employeeId: string, purpose = "calendar"): Promise<string> {
  return `${employeeId}.${await sign(employeeId, purpose)}`;
}

// Trả employeeId nếu mã hợp lệ, null nếu sai.
export async function verifyCalendarFeedToken(token: string, purpose = "calendar"): Promise<string | null> {
  const [employeeId, sig] = token.replace(/\.ics$/, "").split(".");
  if (!employeeId || !sig || !/^[0-9a-f-]{36}$/.test(employeeId)) return null;
  const expected = await sign(employeeId, purpose);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? employeeId : null;
}
