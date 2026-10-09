// Kiểm tra form khách Công ty / Cá nhân (B6, Grok CRM 09/10) — dùng chung cho
// form (báo lỗi ngay khi rời ô) và server action (chặn thật). Hàm thuần.

export type CustomerKind = "company" | "individual";

export interface CustomerFormInput {
  customer_type: CustomerKind;
  name: string;
  phone: string;
  email: string;
  contact_name: string;
  tax_code: string;
  wants_vat: boolean;
  invoice_email: string;
  id_number: string;
  // Sửa khách đã có CCCD mà người sửa không được xem số đủ: ô để trống nghĩa
  // là giữ nguyên số cũ.
  has_existing_id_number?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "+84 912 345 678" / "84.912.345.678" → "0912345678".
export function normalizePhone(value: string): string {
  let v = value.replace(/[\s.\-()]/g, "");
  if (v.startsWith("+84")) v = "0" + v.slice(3);
  else if (/^84\d{9}$/.test(v)) v = "0" + v.slice(2);
  return v;
}

export const normalizeDigits = (value: string) => value.replace(/[\s.]/g, "");

export const isValidPhone = (value: string) => /^0\d{9}$/.test(normalizePhone(value));
export const isValidCccd = (value: string) => /^\d{12}$/.test(normalizeDigits(value));
export const isValidMst = (value: string) => /^\d{10}(-\d{3})?$/.test(normalizeDigits(value));

// Mã tỉnh 3 số đầu CCCD — sai chỉ CẢNH BÁO, không chặn (spec B6).
const PROVINCE_CODES = new Set(
  "001 002 004 006 008 010 011 012 014 015 017 019 020 022 024 025 026 027 030 031 033 034 035 036 037 038 040 042 044 045 046 048 049 051 052 054 056 058 060 062 064 066 067 068 070 072 074 075 077 079 080 082 083 084 086 087 089 091 092 093 094 095 096".split(
    " ",
  ),
);
export const cccdProvinceWarning = (value: string) => {
  const v = normalizeDigits(value);
  return /^\d{12}$/.test(v) && !PROVINCE_CODES.has(v.slice(0, 3))
    ? "3 số đầu không phải mã tỉnh thường gặp — kiểm tra lại."
    : null;
};

// Che CCCD theo mẫu CEO chốt 09/10: 4 số đầu + "x" ("1234xxxxxxxx").
export const maskIdNumber = (value: string | null | undefined) =>
  value ? value.slice(0, 4) + "x".repeat(Math.max(0, value.length - 4)) : null;

// Lỗi theo từng ô (khoá = tên ô). Rỗng = hợp lệ.
export function validateCustomer(input: CustomerFormInput): Record<string, string> {
  const e: Record<string, string> = {};
  const company = input.customer_type === "company";
  if (input.name.trim().length < 2) e.name = company ? "Nhập tên công ty (ít nhất 2 ký tự)." : "Nhập họ tên khách.";
  else if (input.name.trim().length > 200) e.name = "Tên dài quá 200 ký tự.";
  if (!input.phone.trim()) e.phone = "Nhập số điện thoại.";
  else if (/[a-zA-Z]/.test(input.phone) || !isValidPhone(input.phone))
    e.phone = "SĐT phải đủ 10 số, bắt đầu bằng 0 (nhập +84 cũng được).";
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) e.email = "Email không hợp lệ.";
  if (company) {
    if (!input.contact_name.trim()) e.contact_name = "Nhập người liên hệ.";
    if (input.wants_vat) {
      if (!input.tax_code.trim()) e.tax_code = "Khách lấy hoá đơn VAT thì phải có MST.";
      else if (!isValidMst(input.tax_code)) e.tax_code = "MST phải là 10 số hoặc 10 số-3 số.";
      if (!input.invoice_email.trim()) e.invoice_email = "Nhập email nhận hoá đơn.";
      else if (!EMAIL_RE.test(input.invoice_email.trim())) e.invoice_email = "Email nhận hoá đơn không hợp lệ.";
    }
  } else {
    const id = input.id_number.trim();
    if (!id && !input.has_existing_id_number) e.id_number = "Nhập số CCCD (12 số).";
    else if (id && !isValidCccd(id)) e.id_number = "Số CCCD phải đủ 12 chữ số.";
  }
  return e;
}
