import { COMPANY_INFO } from "@/lib/company-info";
import { transferRef, vietQrImageUrl } from "@/lib/vietqr";

const vnd = new Intl.NumberFormat("vi-VN");

// Ô QR chuyển khoản có số tiền + nội dung sẵn — dùng ở trang đơn và chứng từ.
// Khách chuyển đúng nội dung thì CRM tự ghi nhận (xem /api/bank/sepay).
export function PaymentQr({
  orderCode,
  amount,
  deposit = false,
  label,
  size = 148,
  lang = "vi",
}: {
  orderCode: string;
  amount: number;
  deposit?: boolean;
  label?: string;
  size?: number;
  // Báo giá tiếng Anh (CEO 2026-10-09).
  lang?: "vi" | "en";
}) {
  const en = lang === "en";
  const ref = transferRef(orderCode, deposit);
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh QR động từ VietQR, không qua Next Image */}
      <img
        src={vietQrImageUrl(amount, ref)}
        alt={`QR chuyển khoản ${vnd.format(amount)}đ nội dung ${ref}`}
        width={size}
        height={size}
        className="shrink-0 rounded-md border bg-white"
      />
      <div className="space-y-0.5 text-xs leading-5">
        {label && <p className="text-sm font-semibold">{label}</p>}
        <p>
          {en ? "Amount" : "Số tiền"}: <b>{en ? `${Math.round(amount).toLocaleString("en-US")} VND` : `${vnd.format(Math.round(amount))}đ`}</b>
        </p>
        <p>
          {en ? "Transfer note" : "Nội dung"}: <b className="font-mono">{ref}</b>
        </p>
        <p>
          {COMPANY_INFO.documentBank.accountNumber} · {COMPANY_INFO.documentBank.shortName}
        </p>
        <p className="text-muted-foreground">{COMPANY_INFO.documentBank.accountName}</p>
      </div>
    </div>
  );
}
