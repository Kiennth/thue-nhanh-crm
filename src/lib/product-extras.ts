// B9 (Grok CRM 09/10): "Đã gồm gì" + FAQ riêng theo sản phẩm, FAQ chung theo
// danh mục — kiểm tra dùng chung cho khung nhập (báo ngay) và server action
// (chặn thật). DB cũng chặn > 5 dòng / > 3 câu (check constraint).

export const INCLUDED_MAX = 5;
export const INCLUDED_MIN = 2;
export const INCLUDED_LINE_MAX = 80;
export const FAQ_MAX = 3;
export const FAQ_Q_MAX = 120;
export const FAQ_A_MAX = 400;

export type Faq = { q: string; a: string };

// Chính sách chung (cọc, CCCD, huỷ, VAT…) đã có ở dải chính sách + trang FAQ
// chung — FAQ sản phẩm nhắc lại thì chỉ GỢI Ý nhẹ, không chặn.
// Ranh giới chữ theo Unicode (\b của JS chỉ hiểu chữ ASCII — "huỷ" không khớp).
const POLICY_RE = /(?<!\p{L})(cọc|cccd|căn cước|huỷ|hủy|hoàn tiền|vat|hoá đơn|hóa đơn)(?!\p{L})/iu;
export const repeatsPolicy = (f: Faq) => POLICY_RE.test(`${f.q} ${f.a}`);

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Dòng đầu phải chứa tên sản phẩm — so không dấu, chỉ cần đủ các từ chính
// (≥ 2/3 số từ dài từ 2 ký tự của tên) để "1 × MacBook Air M3" khớp
// "MacBook Air M3 13 inch 16GB". Sai chỉ CẢNH BÁO.
export function firstLineHasName(line: string, name: string): boolean {
  const words = fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (!words.length) return true;
  const hay = fold(line);
  const hit = words.filter((w) => hay.includes(w)).length;
  return hit >= Math.max(1, Math.ceil((words.length * 2) / 3)) || hit >= 3;
}

// Gợi ý "Đã gồm gì" từ tên + phụ kiện đi kèm của mã (default_extra_information
// "Sạc | Cable | Ốp lưng" — dùng cho biên bản bàn giao).
export function includedSuggestion(name: string, accessories: string | null | undefined): string[] {
  const acc = (accessories ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return [`1 × ${name}`.slice(0, INCLUDED_LINE_MAX), ...acc.map((a) => a.slice(0, INCLUDED_LINE_MAX))].slice(0, INCLUDED_MAX);
}

export function cleanIncludedItems(input: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Danh sách 'Đã gồm gì' không hợp lệ." };
  const lines = input.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (lines.length > INCLUDED_MAX) return { ok: false, error: `"Đã gồm gì" tối đa ${INCLUDED_MAX} dòng.` };
  const long = lines.findIndex((l) => l.length > INCLUDED_LINE_MAX);
  if (long >= 0) return { ok: false, error: `"Đã gồm gì" dòng ${long + 1} dài quá ${INCLUDED_LINE_MAX} ký tự.` };
  return { ok: true, value: lines };
}

export function cleanFaqs(input: unknown): { ok: true; value: Faq[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: "FAQ không hợp lệ." };
  const out: Faq[] = [];
  for (const [i, raw] of input.entries()) {
    const q = String((raw as Faq)?.q ?? "").trim();
    const a = String((raw as Faq)?.a ?? "").trim();
    if (!q && !a) continue;
    if (!q || !a) return { ok: false, error: `FAQ câu ${i + 1}: cần cả câu hỏi và câu trả lời.` };
    if (q.length > FAQ_Q_MAX) return { ok: false, error: `FAQ câu ${i + 1}: câu hỏi dài quá ${FAQ_Q_MAX} ký tự.` };
    if (a.length > FAQ_A_MAX) return { ok: false, error: `FAQ câu ${i + 1}: câu trả lời dài quá ${FAQ_A_MAX} ký tự.` };
    out.push({ q, a });
  }
  if (out.length > FAQ_MAX) return { ok: false, error: `Tối đa ${FAQ_MAX} câu hỏi.` };
  return { ok: true, value: out };
}
