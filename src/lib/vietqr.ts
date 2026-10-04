import { COMPANY_INFO } from "@/lib/company-info";

// Thanh toán QR có số tiền + nội dung sẵn (CEO 2026-10-04). Ảnh QR chuẩn
// VietQR (Napas) sinh từ img.vietqr.io — app ngân hàng nào quét cũng điền
// sẵn tài khoản, số tiền, nội dung. Nội dung = mã đơn bỏ dấu "-" (ngân hàng
// hay tự xoá ký tự đặc biệt), thêm " COC" khi là tiền ký quỹ — webhook
// SePay (/api/bank/sepay) đọc lại để tự ghi vào đúng đơn.

export function transferRef(orderCode: string, deposit = false): string {
  const ref = orderCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return deposit ? `${ref} COC` : ref;
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
// DH + 8 số ngày + 3 số, hoặc BQ + số.
export function parseTransferContent(content: string): { orderCode: string; deposit: boolean } | null {
  const up = content
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ");
  const deposit = /(^|\s|\d)COC(\s|$)/.test(up);
  const dh = /DH\s?(\d{8})\s?(\d{3})(?!\d)/.exec(up);
  if (dh) return { orderCode: `DH${dh[1]}-${dh[2]}`, deposit };
  const bq = /BQ\s?(\d{3,6})(?!\d)/.exec(up);
  if (bq) return { orderCode: `BQ${bq[1]}`, deposit };
  return null;
}
