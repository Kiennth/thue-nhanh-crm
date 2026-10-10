import { COMPANY_INFO } from "@/lib/company-info";

// Thanh toán QR có số tiền + nội dung sẵn (CEO 2026-10-04). Ảnh QR chuẩn
// VietQR (Napas) sinh từ img.vietqr.io — app ngân hàng nào quét cũng điền
// sẵn tài khoản, số tiền, nội dung. Nội dung có mã đơn bỏ dấu "-" (ngân hàng
// hay tự xoá ký tự đặc biệt), xem transferRef — webhook
// SePay (/api/bank/sepay) đọc lại để tự ghi vào đúng đơn.

// CEO 2026-10-04: tiền thuê ghi "THANH TOAN <mã đơn>", tiền ký quỹ ghi
// "DAT COC <mã đơn>". Webhook nhận ra cọc nhờ chữ "COC" (vẫn đọc được nội
// dung kiểu cũ "<mã đơn> COC").
export function transferRef(orderCode: string, deposit = false): string {
  const ref = orderCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return deposit ? `DAT COC ${ref}` : `THANH TOAN ${ref}`;
}

export function vietQrImageUrl(amount: number, ref: string): string {
  const account = COMPANY_INFO.documentBank.accountNumber.replace(/\s/g, "");
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(amount))),
    addInfo: ref,
    accountName: COMPANY_INFO.documentBank.accountName,
  });
  return `https://img.vietqr.io/image/${COMPANY_INFO.documentBank.bin}-${account}-compact2.png?${params.toString()}`;
}

// Đọc mã đơn từ nội dung chuyển khoản. Ngân hàng hay chèn thêm chữ (tên
// người chuyển, "CHUYEN TIEN", mã giao dịch...) và bỏ dấu "-" → tìm mẫu
// DH + 8 số ngày + 3 số, BQ + số, PO + số (PO13111… — CEO 2026-10-05);
// số đứng ngay sau "THANH TOAN"/"DAT COC". Từ 10/10 mã đơn mới chỉ còn số
// (13225…, CEO bỏ chữ PO) — cùng 1 dãy số nên "13225" và "PO13225" không thể
// cùng tồn tại: trả cả 2 cách viết (altCodes), nơi tra đơn thử cả hai.
export function parseTransferContent(
  content: string,
): { orderCode: string; altCodes: string[]; deposit: boolean } | null {
  const up = content
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ");
  const deposit = /(^|\s|\d)COC(\s|$)/.test(up);
  const dh = /DH\s?(\d{8})\s?(\d{3})(?!\d)/.exec(up);
  if (dh) return { orderCode: `DH${dh[1]}-${dh[2]}`, altCodes: [], deposit };
  const bq = /BQ\s?(\d{3,6})(?!\d)/.exec(up);
  if (bq) return { orderCode: `BQ${bq[1]}`, altCodes: [], deposit };
  const po = /(?:^|[^A-Z])PO\s?(\d{5,7})(?!\d)/.exec(up);
  if (po) return { orderCode: `PO${po[1]}`, altCodes: [po[1]], deposit };
  const num = /(?:THANH\s?TOAN|DAT\s?COC)\s?(\d{5,7})(?!\d)/.exec(up);
  if (num) return { orderCode: num[1], altCodes: [`PO${num[1]}`], deposit };
  return null;
}
