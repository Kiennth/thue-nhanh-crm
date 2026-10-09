import type { ReactNode } from "react";
import { PaymentQr } from "@/components/payment-qr";
import { transferRef } from "@/lib/vietqr";
import { COMPANY_INFO } from "@/lib/company-info";
import { VAT_RATE } from "@/lib/order-labels";
import { vndToWords } from "@/lib/vnd-words";
import type { DocRow, DocTotals, MonthlyQuote } from "@/lib/order-document-data";

// Các mẫu chứng từ theo đúng file mẫu CEO gửi 2026-09-30 (Báo giá — Google
// Sheets; Đề nghị thanh toán, Biên bản bàn giao, Biên bản nghiệm thu — Google
// Docs). Câu chữ chép nguyên văn từ mẫu, chỉ điền dữ liệu của đơn vào chỗ
// trống. Chỗ mẫu để "……" cho người ký viết tay (người giao/nhận, CCCD, giờ bàn
// giao) thì giữ nguyên dấu chấm.

export interface DocContext {
  docNumber: string;
  // Mã đơn (PO) — điền ô "PO" trên chứng từ (CEO 2026-10-04).
  orderCode: string;
  // "ngày 30 tháng 09 năm 2026" của ngày lập đơn — dùng làm ngày ký hợp đồng.
  contractDateText: string;
  orderDate: string; // dd/mm/yyyy
  city: string;
  customer: {
    name: string;
    address: string | null;
    taxCode: string | null;
    // Mã số ĐVQHNS (CEO 2026-10-04) — chỉ in khi khách có.
    budgetUnitCode: string | null;
    // Thông tin hợp đồng (CEO 2026-10-04) — trống thì in dòng chấm như cũ.
    representativeName: string | null;
    representativeTitle: string | null;
    bankAccountNumber: string | null;
    bankName: string | null;
    phone: string | null;
    email: string | null;
  };
  rows: DocRow[];
  totals: DocTotals;
  pickupText: string;
  returnText: string;
  pickupDateParts: { day: string; month: string; year: string } | null;
  returnDateText: string;
  rentalDays: number | null;
  placeText: string;
  // Biên bản giao hàng: địa chỉ giao + người nhận/SĐT (CEO 2026-10-05).
  deliveryAddress: string;
  receiverName: string | null;
  receiverPhone: string | null;
  paid: number;
  depositHeld: number;
  // Đơn ≥ 30 ngày: báo giá in theo tháng + lịch thanh toán (CEO 2026-10-09).
  monthly?: MonthlyQuote | null;
}

const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const fmt = (n: number) => money.format(n);
const DOTS = "……………………………………";
const SHORT_DOTS = "………";
const vatLabel = `VAT (${Math.round(VAT_RATE * 100)}%)`;
const MONTH_DAYS_DOC = 30;

const cell = "border border-black px-1.5 py-1 align-top";
const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`${cell} text-center font-bold ${className}`}>{children}</th>
);
const Td = ({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) => (
  <td className={`${cell} ${className}`} colSpan={colSpan}>
    {children}
  </td>
);

function NationalHeader() {
  return (
    <div className="text-center">
      <p className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
      <p className="font-bold">Độc lập - Tự do - Hạnh phúc</p>
      <p>---o0o---</p>
    </div>
  );
}

function RowDescription({ row, showNote = true }: { row: DocRow; showNote?: boolean }) {
  return (
    <>
      {row.description}
      {row.details.map((d) => (
        <span key={d} className="block text-[11px] leading-4">
          - {d}
        </span>
      ))}
      {showNote && row.note && (
        <span className="block text-[11px] leading-4 whitespace-pre-wrap italic">{row.note}</span>
      )}
    </>
  );
}

// Phụ kiện đi kèm (CEO 2026-10-06, học Booqable): ghi chú dòng "Gậy | Thẻ nhớ
// | Sạc" in thành từng ô ☐ để kỹ thuật/khách tick kiểm đếm lúc bàn giao.
function AccessoryChecklist({ note }: { note: string | null }) {
  const items = (note ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className="block text-[11px] leading-4 whitespace-nowrap">
          ☐ {item}
        </span>
      ))}
    </>
  );
}

// Bảng giá 9 cột dùng chung cho Báo giá (có thêm cột "Đơn giá/gói") và Biên
// bản nghiệm thu.
function PriceRows({
  rows,
  withPackageColumn,
  format = fmt,
}: {
  rows: DocRow[];
  withPackageColumn: boolean;
  format?: (n: number) => string;
}) {
  const fmt = format;
  return (
    <>
      {rows.map((row, index) => (
        <tr key={row.key}>
          <Td className="text-center">{index + 1}</Td>
          <Td>
            <RowDescription row={row} />
          </Td>
          <Td className="text-center">{row.unit}</Td>
          <Td className="text-center">{row.quantity}</Td>
          <Td className="text-center">{row.days ?? ""}</Td>
          {withPackageColumn ? (
            <>
              <Td className="text-right">{row.pricePerDay != null ? fmt(row.pricePerDay) : ""}</Td>
              <Td className="text-right">{row.pricePerPackage != null ? fmt(row.pricePerPackage) : ""}</Td>
            </>
          ) : (
            <Td className="text-right">{fmt(row.pricePerDay ?? row.pricePerPackage ?? 0)}</Td>
          )}
          <Td className="text-right">{fmt(row.amount)}</Td>
          <Td className="text-right">{fmt(row.vat)}</Td>
          <Td className="text-right">{fmt(row.total)}</Td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// BÁO GIÁ
// ---------------------------------------------------------------------------
// Chữ song ngữ của báo giá (CEO 2026-10-09: "cả hai" — báo giá theo tháng có
// bản tiếng Anh cho khách nước ngoài). ?lang=en ở trang in.
const QUOTE_TEXT = {
  vi: {
    title: "BÁO GIÁ",
    titleMonthly: "BÁO GIÁ THUÊ THEO THÁNG",
    no: "Số",
    partyA: "BÊN A",
    partyB: "BÊN B",
    address: "Địa chỉ",
    taxCode: "Mã số thuế",
    taxCodeB: "MST",
    budgetCode: "Mã số ĐVQHNS",
    rep: "Người đại diện",
    repTitle: "Chức vụ",
    phone: "SĐT",
    email: "Email",
    date: "Ngày",
    seq: "Số thứ tự",
    account: "Số tài khoản",
    at: "tại",
    intro: "Bên A đáp ứng đủ tiêu chuẩn để cung cấp dịch vụ cho thuê thiết bị theo yêu cầu của Bên B, cụ thể như sau:",
    no_: "STT",
    desc: "Mô tả",
    unit: "ĐVT",
    qty: "Số lượng",
    days: "Số ngày",
    perDay: "Đơn giá/ ngày (VNĐ)",
    perPackage: "Đơn giá/ gói (VNĐ)",
    amount: "Thành tiền (VNĐ)",
    total: "Tổng số tiền (VNĐ)",
    rental: "Tiền thuê",
    deposit: "Tiền ký quỹ (đặt cọc thiết bị)",
    rentalAndDeposit: "Tiền thuê và tiền ký quỹ",
    perMonth: "Đơn giá/ tháng (VNĐ)",
    amountMonth: "Thành tiền/ tháng (VNĐ)",
    months: "Số tháng",
    contractAmount: "Thành tiền cả hợp đồng (VNĐ)",
    oneMonthRef: (ref: string, pct: number) => `Giá thuê lẻ 1 tháng ${ref} — ưu đãi cam kết −${pct}%`,
    oneOff: "Thu 1 lần ở kỳ 1",
    monthlyRental: "Tiền thuê mỗi tháng",
    monthlyPay: "Thanh toán mỗi tháng (gồm VAT)",
    contractTotal: (m: string) => `Tổng giá trị hợp đồng ${m} tháng (gồm VAT)`,
    schedule: "Lịch thanh toán",
    period: "Kỳ",
    time: "Thời gian",
    dueDate: "Hạn thanh toán",
    vatCol: "VAT",
    payTotal: "Tổng thanh toán (VNĐ)",
    inWords: "Bằng chữ",
    rentalLine: "Tiền thuê",
    depositLine: "Tiền ký quỹ",
    depositNote:
      "(Để tránh nhầm lẫn, khoản tiền ký quỹ (đặt cọc thiết bị) này mang tính đảm bảo chất lượng của thiết bị thuê trong suốt quá trình diễn ra sự kiện đến khi Bên B trả lại thiết bị thì Bên A phải hoàn trả cho Bên B)",
    pickup: "Ngày nhận",
    return: "Ngày trả",
    duration: "Thời gian thuê",
    durationText: (d: string) =>
      `${d} ngày. (24 giờ từ giờ nhận đến giờ trả thiết bị được tính là 01 ngày thuê). Số lượng thiết bị thuê, thời gian thuê có thể gia hạn nhưng không thể rút bớt.`,
    place: "Địa điểm nhận & trả",
    pay1: (a: string, w: string) =>
      `Bên B chuyển khoản 100% số tiền thuê: ${a} VNĐ (Bằng chữ: ${w}) ngay sau khi nhận báo giá để báo giá có hiệu lực.`,
    pay2: (a: string, w: string) =>
      `Bên B chuyển khoản 100% số tiền ký quỹ: ${a} VNĐ (Bằng chữ: ${w}) trong vòng 24 giờ trước ngày nhận để Bên A làm thủ tục xuất kho đóng gói vận chuyển tới địa điểm do Bên B yêu cầu.`,
    pay1Label: "Thanh toán đợt 1",
    pay2Label: "Thanh toán đợt 2",
    payMonthly: (first: string) =>
      `Kỳ 1 (${first} VNĐ, gồm phí giao/thu hồi nếu có) thanh toán ngay sau khi nhận báo giá để giữ chỗ; tiền ký quỹ thanh toán trong vòng 24 giờ trước ngày nhận. Các kỳ sau thanh toán vào ĐẦU mỗi kỳ, trước ngày ghi trong lịch thanh toán.`,
    payMonthlyLabel: "Thanh toán",
    accName: "Tên tài khoản",
    accNo: "Số tài khoản",
    qr1: "Đợt 1 — tiền thuê",
    qr1Monthly: "Kỳ 1 — tiền thuê",
    qr2: "Đợt 2 — ký quỹ",
    refund: "Hoàn cọc",
    refundText:
      "Bên A chuyển khoản hoàn tiền ký quỹ (sau khi trừ chi phí phát sinh nếu có) sau khi bên B trả lại thiết bị cho bên A, tối đa 24h làm việc.",
    terms: "Điều khoản",
  },
  en: {
    title: "QUOTATION",
    titleMonthly: "MONTHLY RENTAL QUOTATION",
    no: "No.",
    partyA: "PARTY A (LESSOR)",
    partyB: "PARTY B (LESSEE)",
    address: "Address",
    taxCode: "Tax code",
    taxCodeB: "Tax code",
    budgetCode: "Budget unit code",
    rep: "Represented by",
    repTitle: "Title",
    phone: "Phone",
    email: "Email",
    date: "Date",
    seq: "No.",
    account: "Bank account",
    at: "at",
    intro: "Party A meets the requirements to provide equipment rental services as requested by Party B, as follows:",
    no_: "No.",
    desc: "Description",
    unit: "Unit",
    qty: "Qty",
    days: "Days",
    perDay: "Price/day (VND)",
    perPackage: "Price/package (VND)",
    amount: "Amount (VND)",
    total: "Total (VND)",
    rental: "Rental",
    deposit: "Security deposit",
    rentalAndDeposit: "Rental and deposit",
    perMonth: "Price/month (VND)",
    amountMonth: "Amount/month (VND)",
    months: "Months",
    contractAmount: "Contract amount (VND)",
    oneMonthRef: (ref: string, pct: number) => `Standard 1-month price ${ref} — commitment discount −${pct}%`,
    oneOff: "One-off, billed in period 1",
    monthlyRental: "Rental per month",
    monthlyPay: "Monthly payment (incl. VAT)",
    contractTotal: (m: string) => `Total contract value, ${m} months (incl. VAT)`,
    schedule: "Payment schedule",
    period: "Period",
    time: "Dates",
    dueDate: "Due date",
    vatCol: "VAT",
    payTotal: "Amount due (VND)",
    inWords: "",
    rentalLine: "Rental",
    depositLine: "Security deposit",
    depositNote:
      "(This refundable deposit secures the rented equipment for the whole rental period; Party A refunds it to Party B after the equipment is returned.)",
    pickup: "Pickup",
    return: "Return",
    duration: "Rental period",
    durationText: (d: string) =>
      `${d} days (24 hours from pickup to return count as 1 rental day). Quantities and rental period can be extended but not reduced.`,
    place: "Pickup & return location",
    pay1: (a: string) => `Party B transfers 100% of the rental, ${a} VND, upon receiving this quotation to confirm it.`,
    pay2: (a: string) =>
      `Party B transfers 100% of the deposit, ${a} VND, at least 24 hours before pickup so Party A can prepare and ship the equipment to the requested location.`,
    pay1Label: "Payment 1",
    pay2Label: "Payment 2",
    payMonthly: (first: string) =>
      `Period 1 (${first} VND, including delivery/collection fees if any) is paid upon receiving this quotation to reserve the equipment; the deposit is paid at least 24 hours before pickup. Later periods are paid at the START of each period, by the due date in the schedule.`,
    payMonthlyLabel: "Payment",
    accName: "Account name",
    accNo: "Account number",
    qr1: "Payment 1 — rental",
    qr1Monthly: "Period 1 — rental",
    qr2: "Payment 2 — deposit",
    refund: "Deposit refund",
    refundText:
      "Party A refunds the deposit by bank transfer (less any incurred costs) within 24 working hours after Party B returns the equipment.",
    terms: "Terms",
  },
} as const;

const QUOTE_TERMS = {
  vi: [
    "Báo giá trên chưa bao gồm các chi phí phát sinh ngoài phạm vi (nếu có) và có thể thay đổi tuỳ thời điểm chốt đơn.",
    "Báo giá có hiệu lực trong vòng 01 tuần kể từ ngày phát hành, trừ khi có thoả thuận khác.",
    "Đơn hàng được xác nhận sau khi khách hàng phản hồi chốt đơn và thanh toán tiền thuê để giữ chỗ.",
    "Huỷ đơn miễn phí, hoàn lại tiền thuê đã thanh toán. Chỉ trừ chi phí thực tế phát sinh (nếu có, ví dụ xe đã đi giao).",
  ],
  en: [
    "This quotation excludes any costs outside its scope (if any) and may change depending on when the order is confirmed.",
    "This quotation is valid for 01 week from the date of issue, unless otherwise agreed.",
    "The order is confirmed once the customer confirms it and pays the rental to reserve the equipment.",
    "Free cancellation with a refund of the rental paid; only costs actually incurred are deducted (if any, e.g. a delivery already on its way).",
  ],
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtEn = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export function QuoteDocument({ ctx, lang = "vi" }: { ctx: DocContext; lang?: "vi" | "en" }) {
  const { totals } = ctx;
  const T = QUOTE_TEXT[lang];
  const en = lang === "en";
  const f = en ? fmtEn : fmt;
  const m = ctx.monthly ?? null;
  const months = m ? (en ? String(m.months) : String(m.months).replace(".", ",")) : "";
  const words = (n: number) => (en ? "" : ` (${T.inWords}: ${vndToWords(n)})`);
  const pickupText = en ? ctx.pickupText.replace(" ngày ", ", ") : ctx.pickupText;
  const returnText = en ? ctx.returnText.replace(" ngày ", ", ") : ctx.returnText;
  const placeText = en ? ctx.placeText.replace(/^Kho Thuê Nhanh /, "Thuê Nhanh store, ") : ctx.placeText;
  const firstPeriod = m?.periods[0]?.total ?? 0;
  const cur = en ? "VND" : "VNĐ";

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h1 className="text-xl font-bold">{m ? T.titleMonthly : T.title}</h1>
        <p>
          {T.no}: {ctx.docNumber}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold">
            {T.partyA}: {COMPANY_INFO.legalName}
          </p>
          <p>
            {T.address}: {COMPANY_INFO.legalAddress}
          </p>
          <p>
            {T.taxCode}: {COMPANY_INFO.taxCode}
          </p>
          <p>
            {T.rep}: {en ? COMPANY_INFO.representativeName : COMPANY_INFO.representative}. {T.repTitle}:{" "}
            {en ? "Director" : COMPANY_INFO.representativeTitle}
          </p>
          <p>
            {T.phone}: {COMPANY_INFO.phone}
          </p>
          <p>
            {T.email}: {COMPANY_INFO.email}
          </p>
        </div>
        <table className="shrink-0 border-collapse">
          <tbody>
            <tr>
              <Td className="font-bold">{T.date}</Td>
              <Td className="min-w-24 text-center">{ctx.orderDate}</Td>
            </tr>
            <tr>
              <Td className="font-bold">{T.seq}</Td>
              <Td className="text-center">1</Td>
            </tr>
            <tr>
              <Td className="font-bold">PO</Td>
              <Td className="text-center">{ctx.orderCode}</Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-bold">
          {T.partyB}: {ctx.customer.name}
        </p>
        <p>
          {T.address}: {ctx.customer.address ?? ""}
        </p>
        <p>
          {T.taxCodeB}: {ctx.customer.taxCode ?? ""}
        </p>
        {ctx.customer.budgetUnitCode && (
          <p>
            {T.budgetCode}: {ctx.customer.budgetUnitCode}
          </p>
        )}
        <p>
          {T.rep}: {ctx.customer.representativeName ?? (en ? SHORT_DOTS : `Ông/ Bà ${SHORT_DOTS}`)} {T.repTitle}:{" "}
          {ctx.customer.representativeTitle ?? SHORT_DOTS}
        </p>
        {ctx.customer.bankAccountNumber && (
          <p>
            {T.account}: {ctx.customer.bankAccountNumber}
            {ctx.customer.bankName ? ` ${T.at} ${ctx.customer.bankName}` : ""}
          </p>
        )}
        <p>
          {T.phone}: {ctx.customer.phone ?? ""}
        </p>
        <p>
          {T.email}: {ctx.customer.email ?? ""}
        </p>
      </div>

      <p>{T.intro}</p>

      {m ? (
        <>
          {/* Đơn ≥ 30 ngày: bảng theo tháng + tổng hợp đồng (CEO 2026-10-09 "cả 2"). */}
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <Th className="w-8">{T.no_}</Th>
                <Th>{T.desc}</Th>
                <Th className="w-10">{T.unit}</Th>
                <Th className="w-12">{T.qty}</Th>
                <Th>{T.perMonth}</Th>
                <Th>{T.amountMonth}</Th>
                <Th className="w-12">{T.months}</Th>
                <Th>{T.contractAmount}</Th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r, idx) => (
                <tr key={r.key}>
                  <Td className="text-center">{idx + 1}</Td>
                  <Td>
                    {r.description}
                    {r.details.map((d) => (
                      <span key={d} className="block text-[11px] leading-4">
                        - {d}
                      </span>
                    ))}
                    {r.refMonthlyUnit && r.discountPct && (
                      <span className="block text-[11px] leading-4 italic">
                        {T.oneMonthRef(f(r.refMonthlyUnit), r.discountPct)}
                      </span>
                    )}
                  </Td>
                  <Td className="text-center">{r.unit}</Td>
                  <Td className="text-center">{r.quantity}</Td>
                  {r.isService ? (
                    <Td colSpan={3} className="text-center text-[11px] italic">
                      {T.oneOff}
                    </Td>
                  ) : (
                    <>
                      <Td className="text-right">{f(r.monthlyUnit ?? 0)}</Td>
                      <Td className="text-right">{f(r.monthlyAmount ?? 0)}</Td>
                      <Td className="text-center">{months}</Td>
                    </>
                  )}
                  <Td className="text-right">{f(r.contractAmount)}</Td>
                </tr>
              ))}
              <tr className="font-bold">
                <Td />
                <Td colSpan={4}>{T.monthlyRental}</Td>
                <Td className="text-right">{f(m.monthlyRental)}</Td>
                <Td colSpan={2} />
              </tr>
              <tr>
                <Td />
                <Td colSpan={4}>{vatLabel}</Td>
                <Td className="text-right">{f(m.monthlyVat)}</Td>
                <Td colSpan={2} />
              </tr>
              <tr className="font-bold">
                <Td />
                <Td colSpan={4}>{T.monthlyPay}</Td>
                <Td className="text-right">{f(m.monthlyTotal)}</Td>
                <Td colSpan={2} />
              </tr>
              <tr className="font-bold">
                <Td />
                <Td colSpan={6}>{T.contractTotal(months)}</Td>
                <Td className="text-right">{f(totals.rentalWithVat)}</Td>
              </tr>
              <tr className="font-bold">
                <Td />
                <Td colSpan={6}>{T.deposit}</Td>
                <Td className="text-right">{f(totals.deposit)}</Td>
              </tr>
            </tbody>
          </table>

          <p className="pt-1 font-bold">{T.schedule}</p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <Th className="w-10">{T.period}</Th>
                <Th>{T.time}</Th>
                <Th>{T.dueDate}</Th>
                <Th>{T.rental} ({en ? "VND" : "VNĐ"})</Th>
                <Th>{T.vatCol}</Th>
                <Th>{T.payTotal}</Th>
              </tr>
            </thead>
            <tbody>
              {m.periods.map((p) => (
                <tr key={p.index}>
                  <Td className="text-center">{p.index}</Td>
                  <Td className="text-center">
                    {dateFmt.format(p.start)} – {dateFmt.format(p.end)}
                    {p.days < MONTH_DAYS_DOC ? ` (${p.days} ${en ? "days" : "ngày"})` : ""}
                  </Td>
                  <Td className="text-center">{dateFmt.format(p.start)}</Td>
                  <Td className="text-right">{f(p.rental)}</Td>
                  <Td className="text-right">{f(p.vat)}</Td>
                  <Td className="text-right font-bold">{f(p.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <Th className="w-8">{T.no_}</Th>
              <Th>{T.desc}</Th>
              <Th className="w-10">{T.unit}</Th>
              <Th className="w-12">{T.qty}</Th>
              <Th className="w-12">{T.days}</Th>
              <Th>{T.perDay}</Th>
              <Th>{T.perPackage}</Th>
              <Th>{T.amount}</Th>
              <Th>{vatLabel}</Th>
              <Th>{T.total}</Th>
            </tr>
          </thead>
          <tbody>
            <PriceRows rows={ctx.rows} withPackageColumn format={f} />
            <tr className="font-bold">
              <Td />
              <Td colSpan={6}>{T.rental}</Td>
              <Td className="text-right">{f(totals.rental)}</Td>
              <Td className="text-right">{f(totals.vat)}</Td>
              <Td className="text-right">{f(totals.rentalWithVat)}</Td>
            </tr>
            <tr className="font-bold">
              <Td />
              <Td colSpan={8}>{T.deposit}</Td>
              <Td className="text-right">{f(totals.deposit)}</Td>
            </tr>
            <tr className="font-bold">
              <Td />
              <Td colSpan={8}>{T.rentalAndDeposit}</Td>
              <Td className="text-right">{f(totals.grand)}</Td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="space-y-1">
        <p>
          <b>{m ? T.contractTotal(months) : T.rentalLine}:</b> {f(totals.rentalWithVat)} {cur}{words(totals.rentalWithVat)}.
        </p>
        <p>
          <b>{T.depositLine}:</b> {f(totals.deposit)} {cur}{words(totals.deposit)}./.{T.depositNote}
        </p>
        <p>
          <b>{T.pickup}:</b> {pickupText}
        </p>
        <p>
          <b>{T.return}:</b> {returnText}
        </p>
        <p>
          <b>{T.duration}:</b> {T.durationText(String(ctx.rentalDays ?? SHORT_DOTS))}
        </p>
        <p>
          <b>{T.place}:</b> {placeText}
        </p>
        {m ? (
          <p>
            <b>{T.payMonthlyLabel}:</b> {T.payMonthly(f(firstPeriod))}
          </p>
        ) : (
          <>
            <p>
              <b>{T.pay1Label}:</b> {T.pay1(f(totals.rentalWithVat), vndToWords(totals.rentalWithVat))}
            </p>
            <p>
              <b>{T.pay2Label}:</b> {T.pay2(f(totals.deposit), vndToWords(totals.deposit))}
            </p>
          </>
        )}
        <p>
          <b>{T.accName}:</b> {COMPANY_INFO.documentBank.accountName}
          <br />
          <b>{T.accNo}:</b> {COMPANY_INFO.documentBank.accountNumber} {T.at} {COMPANY_INFO.documentBank.bankName}.
        </p>
        {/* QR chuyển khoản (CEO 2026-10-04) — đúng nội dung thì CRM tự ghi nhận. */}
        <div className="grid grid-cols-2 gap-4 py-1">
          {(m ? firstPeriod : totals.rentalWithVat) > 0 && (
            <PaymentQr
              orderCode={ctx.orderCode}
              amount={m ? firstPeriod : totals.rentalWithVat}
              label={m ? T.qr1Monthly : T.qr1}
              size={120}
              lang={lang}
            />
          )}
          {totals.deposit > 0 && (
            <PaymentQr orderCode={ctx.orderCode} amount={totals.deposit} deposit label={m ? T.depositLine : T.qr2} size={120} lang={lang} />
          )}
        </div>
        <p>
          <b>{T.refund}:</b> {T.refundText}
        </p>
        <p className="pt-1 font-bold">{T.terms}</p>
        <ul className="list-disc pl-5">
          {QUOTE_TERMS[lang].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end pt-2">
        <div className="w-64 text-center">
          <p className="font-bold">{COMPANY_INFO.name}</p>
          <p className="font-bold">{en ? "Director" : COMPANY_INFO.representativeTitle}</p>
          <div className="h-20" />
          <p className="font-bold">{COMPANY_INFO.representativeName}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ĐỀ NGHỊ THANH TOÁN
// ---------------------------------------------------------------------------
export function PaymentRequestDocument({ ctx }: { ctx: DocContext }) {
  // Số tiền đề nghị = tiền thuê (gồm VAT) còn chưa thanh toán; đơn chưa thu
  // đồng nào thì là toàn bộ tiền thuê.
  const due = ctx.totals.rentalWithVat - ctx.paid;
  const amount = due > 0 ? due : ctx.totals.rentalWithVat;
  // Ký quỹ còn phải thu = cọc của đơn trừ số đang giữ.
  const depositDue = Math.max(0, ctx.totals.deposit - ctx.depositHeld);
  const contractRef = `${ctx.docNumber} ${ctx.contractDateText}`;
  return (
    <div className="space-y-3 leading-7">
      <NationalHeader />
      <h1 className="pt-2 text-center text-xl font-bold">ĐỀ NGHỊ THANH TOÁN</h1>
      <p>
        <b>Kính gửi:</b> Quý khách hàng {ctx.customer.name}
      </p>
      <p className="text-justify">
        Căn cứ vào thoả thuận giữa hai bên theo hợp đồng số {contractRef} giữa Bên cho thuê:{" "}
        {COMPANY_INFO.legalName} (Bên A) và Bên thuê: {ctx.customer.name} (Bên B), Bên A gửi hợp đồng
        đã ký theo thoả thuận của hai bên.
      </p>
      <p className="text-justify">
        Theo điều khoản thanh toán của hợp đồng, Bên B sẽ thanh toán cho Bên A số tiền:{" "}
        <b>{fmt(amount)} VNĐ</b> (Bằng chữ: {vndToWords(amount)}) sau khi nhận hợp đồng đã ký để hợp
        đồng có hiệu lực.
      </p>
      <p className="text-justify">
        Chính vì vậy, Bên A kính đề nghị quý khách hàng thanh toán theo thông tin hợp đồng số{" "}
        {contractRef} để làm căn cứ cho Bên A thực hiện theo hợp đồng.
      </p>
      <div>
        <p>Thông tin thanh toán như sau:</p>
        <p>Ngân hàng: {COMPANY_INFO.documentBank.bankName}.</p>
        <p>Số tài khoản: {COMPANY_INFO.documentBank.accountNumber}</p>
        <p>Tên tài khoản: {COMPANY_INFO.documentBank.accountName}</p>
        <p>
          Nội dung chuyển khoản: {transferRef(ctx.orderCode)}
          {depositDue > 0 && <> (tiền thuê) · {transferRef(ctx.orderCode, true)} (ký quỹ)</>}
        </p>
        {/* 2 QR như báo giá (CEO 2026-10-05): tiền thuê + ký quỹ còn phải thu. */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          {amount > 0 && (
            <PaymentQr orderCode={ctx.orderCode} amount={amount} label="Đợt 1 — tiền thuê" size={120} />
          )}
          {depositDue > 0 && (
            <PaymentQr orderCode={ctx.orderCode} amount={depositDue} deposit label="Đợt 2 — ký quỹ" size={120} />
          )}
        </div>
      </div>
      <p>Rất mong nhận được sự hợp tác từ quý khách hàng. Chúng tôi xin trân trọng cảm ơn!</p>
      <div className="flex justify-end pt-2">
        <div className="w-72 text-center">
          <p className="font-bold">CTCP TM DỊCH VỤ THUÊ NHANH</p>
          <p className="font-bold">{COMPANY_INFO.representativeTitle}</p>
          <div className="h-24" />
          <p className="font-bold">{COMPANY_INFO.representativeName}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BIÊN BẢN BÀN GIAO THIẾT BỊ THUÊ
// ---------------------------------------------------------------------------
function PartyLine({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <p className="flex">
      <span className="w-32 shrink-0">{label}</span>
      <span className="mr-1">:</span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export function HandoverDocument({ ctx }: { ctx: DocContext }) {
  const contractRef = `${ctx.docNumber} ký ${ctx.contractDateText}`;
  // Biên bản bàn giao chỉ liệt kê thiết bị/hàng hoá — không gồm dòng phí dịch vụ.
  const rows = ctx.rows.filter((row) => !row.isService);
  const d = ctx.pickupDateParts;
  return (
    <div className="space-y-3">
      <NationalHeader />
      <h1 className="pt-2 text-center text-xl font-bold">BIÊN BẢN BÀN GIAO THIẾT BỊ THUÊ</h1>
      <p className="text-right italic">
        {ctx.city}, ngày {d?.day ?? "….."} tháng {d?.month ?? "…"} năm {d?.year ?? "…"}
      </p>
      <p>Căn cứ vào hợp đồng số: {contractRef}. Chúng tôi gồm:</p>

      <div>
        <p className="font-bold">BÊN GIAO : {COMPANY_INFO.legalName}</p>
        <PartyLine label="Địa chỉ">{COMPANY_INFO.legalAddress}</PartyLine>
        <PartyLine label="Mã số thuế">{COMPANY_INFO.taxCode}</PartyLine>
        <PartyLine label="Người giao">{DOTS}</PartyLine>
        <PartyLine label="Số điện thoại">{DOTS}</PartyLine>
        <PartyLine label="Số CCCD">
          {DOTS} Cấp ngày: {DOTS}
        </PartyLine>
        <p className="italic">(Sau đây gọi là Bên A)</p>
      </div>

      <div>
        <p className="font-bold">BÊN NHẬN : {ctx.customer.name}</p>
        <PartyLine label="Địa chỉ">{ctx.customer.address ?? ""}</PartyLine>
        {/* MST đứng trên Địa chỉ giao hàng (CEO 2026-10-06). */}
        <PartyLine label="MST">{ctx.customer.taxCode ?? ""}</PartyLine>
        {ctx.customer.budgetUnitCode && (
          <PartyLine label="Mã số ĐVQHNS">{ctx.customer.budgetUnitCode}</PartyLine>
        )}
        <PartyLine label="Địa chỉ giao hàng">{ctx.deliveryAddress}</PartyLine>
        <PartyLine label="Người nhận">{ctx.receiverName ?? DOTS}</PartyLine>
        <PartyLine label="Số điện thoại">{ctx.receiverPhone ?? DOTS}</PartyLine>
        <PartyLine label="Số CCCD">
          {DOTS} Cấp ngày: {DOTS}
        </PartyLine>
        <p className="italic">(Sau đây gọi là Bên B)</p>
      </div>

      <p className="text-justify">
        Hôm nay, vào lúc …… giờ, ngày {d?.day ?? "……"} tháng {d?.month ?? "……"} năm {d?.year ?? "……"}.
        Bên A tiến hành bàn giao thiết bị cho Bên B theo thông tin chi tiết như sau:
      </p>

      <p className="font-bold">1. Các trang thiết bị gồm:</p>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th className="w-8">STT</Th>
            <Th>Mô tả</Th>
            <Th className="w-10">ĐVT</Th>
            <Th className="w-10">SL</Th>
            <Th className="w-40">Serial Number</Th>
            <Th className="w-32">Phụ kiện</Th>
            <Th className="w-24">Tình trạng</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              <Td className="text-center">{index + 1}</Td>
              <Td>
                {/* Ghi chú phụ kiện đã có cột riêng — không in lặp dưới tên. */}
                <RowDescription row={row} showNote={false} />
              </Td>
              <Td className="text-center">{row.unit}</Td>
              <Td className="text-center">{row.quantity}</Td>
              <Td className="font-mono text-[10.5px] break-all">
                {row.serials.map((serial) => (
                  <span key={serial} className="block">
                    {serial}
                  </span>
                ))}
              </Td>
              <Td>
                <AccessoryChecklist note={row.note} />
              </Td>
              <Td />
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <Td colSpan={7} className="text-center">
                Chưa có thiết bị nào trên đơn.
              </Td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="text-justify">
        <b>2. Lý do bàn giao:</b> Bên A bàn giao thiết bị được thống nhất giữa hai bên được ghi nhận
        tại Hợp đồng số {contractRef}. Bên B đã kiểm tra và nhận bàn giao đầy đủ số lượng trang thiết
        bị, phụ kiện tình trạng như trên và có trách nhiệm bảo quản, giữ gìn giao trả nguyên vẹn và
        đúng thời gian đã thỏa thuận ban đầu.
      </p>
      <p className="text-justify">
        Biên bản được lập thành 02 bản, các bản có giá trị pháp lý như nhau, mỗi bên có trách nhiệm
        giữ một bản. Các bên tiến hành xác nhận các nội dung trên cùng đi đến thống nhất và ký xác
        nhận dưới đây.
      </p>

      <div className="grid grid-cols-2 pt-2 text-center font-bold">
        <p>BÊN GIAO</p>
        <p>BÊN NHẬN</p>
      </div>
      <div className="h-24" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BIÊN BẢN NGHIỆM THU
// ---------------------------------------------------------------------------
function ValueTable({ rows, totals, withDeposit }: { rows: DocRow[]; totals: DocTotals; withDeposit: boolean }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr>
          <Th className="w-8">STT</Th>
          <Th>Mô tả</Th>
          <Th className="w-10">ĐVT</Th>
          <Th className="w-12">Số lượng</Th>
          <Th className="w-12">Số ngày</Th>
          <Th>Đơn giá (VNĐ)</Th>
          <Th>Thành tiền (VNĐ)</Th>
          <Th>{vatLabel}</Th>
          <Th>Tổng số tiền (VNĐ)</Th>
        </tr>
      </thead>
      <tbody>
        <PriceRows rows={rows} withPackageColumn={false} />
        {withDeposit && (
          <tr>
            <Td />
            <Td colSpan={7}>Tiền ký quỹ</Td>
            <Td className="text-right">{fmt(totals.deposit)}</Td>
          </tr>
        )}
        <tr className="font-bold">
          <Td />
          <Td colSpan={5}>Tổng tiền thuê</Td>
          <Td className="text-right">{fmt(totals.rental)}</Td>
          <Td className="text-right">{fmt(totals.vat)}</Td>
          <Td className="text-right">{fmt(totals.rentalWithVat)}</Td>
        </tr>
        {withDeposit && (
          <tr className="font-bold">
            <Td />
            <Td colSpan={7}>Tiền thuê và tiền ký quỹ</Td>
            <Td className="text-right">{fmt(totals.grand)}</Td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function AcceptanceDocument({ ctx }: { ctx: DocContext }) {
  const { totals } = ctx;
  const contractRef = `${ctx.docNumber} ký ${ctx.contractDateText}`;
  const remaining = Math.max(0, totals.rentalWithVat - ctx.paid);
  const depositToRefund = Math.max(0, ctx.depositHeld);
  const settlement: [string, number][] = [
    ["Giá trị theo hợp đồng đã ký", totals.rentalWithVat],
    ["Tiền ký quỹ theo hợp đồng (nếu có)", totals.deposit],
    ["Giá trị theo nghiệm thu thực tế", totals.rentalWithVat],
    ["Phát sinh giảm", 0],
    ["Phát sinh tăng", 0],
    ["Bên B đã thanh toán đợt 1", ctx.paid],
    ["Số tiền còn lại Bên B phải thanh toán", remaining],
    ["Số tiền ký quỹ Bên A phải hoàn lại", depositToRefund],
  ];
  return (
    <div className="space-y-2.5">
      <NationalHeader />
      <div className="pt-2 text-center">
        <h1 className="text-xl font-bold">BIÊN BẢN NGHIỆM THU</h1>
        <p className="italic">của hợp đồng số: {contractRef}</p>
      </div>
      <p>Hôm nay {ctx.returnDateText}, chúng tôi gồm:</p>

      <div>
        <p className="font-bold">BÊN CHO THUÊ: {COMPANY_INFO.legalName}</p>
        <PartyLine label="Địa chỉ">{COMPANY_INFO.legalAddress}</PartyLine>
        <PartyLine label="Mã số thuế">{COMPANY_INFO.taxCode}</PartyLine>
        <PartyLine label="Đại diện">
          {COMPANY_INFO.representative}. Chức vụ: {COMPANY_INFO.representativeTitle}
        </PartyLine>
        <p className="italic">(Sau đây gọi là Bên A)</p>
      </div>
      <div>
        <p className="font-bold">BÊN THUÊ : {ctx.customer.name}</p>
        <PartyLine label="Địa chỉ">{ctx.customer.address ?? ""}</PartyLine>
        <PartyLine label="Mã số thuế">{ctx.customer.taxCode ?? ""}</PartyLine>
        {ctx.customer.budgetUnitCode && (
          <PartyLine label="Mã số ĐVQHNS">{ctx.customer.budgetUnitCode}</PartyLine>
        )}
        {/* Người ký nghiệm thu thường KHÔNG phải người đại diện trên hồ sơ khách
            (CEO 2026-10-04) — để chấm cho ghi tay; người đại diện chỉ điền ở
            báo giá/hợp đồng. */}
        <PartyLine label="Đại diện">
          {DOTS} Chức vụ: {SHORT_DOTS}
        </PartyLine>
        {ctx.customer.bankAccountNumber && (
          <PartyLine label="Số tài khoản">
            {ctx.customer.bankAccountNumber}
            {ctx.customer.bankName ? ` tại ${ctx.customer.bankName}` : ""}
          </PartyLine>
        )}
        <p className="italic">(Sau đây gọi là Bên B)</p>
      </div>

      <p>Bên A đã hoàn thành các hạng mục công việc theo yêu cầu của Bên B chi tiết như sau:</p>
      <p>
        <b>Thời gian nghiệm thu:</b> {ctx.returnText}
      </p>
      <div>
        <p className="font-bold">Đánh giá công việc đã thực hiện:</p>
        <p>Chất lượng công việc: Đáp ứng đúng nhu cầu Bên B.</p>
        <p>Kết luận: Chấp nhận nghiệm thu và thanh lý hợp đồng.</p>
      </div>

      <p className="font-bold">Giá trị hợp đồng:</p>
      <p>Tổng giá trị hợp đồng đã ký kết (đã bao gồm VAT):</p>
      <ValueTable rows={ctx.rows} totals={totals} withDeposit />
      <p className="italic">(Bằng chữ: {vndToWords(totals.grand)})</p>

      <p>Tổng giá trị nghiệm thu thực tế (đã bao gồm VAT):</p>
      <ValueTable rows={ctx.rows} totals={totals} withDeposit={false} />
      <p className="italic">(Bằng chữ: {vndToWords(totals.rentalWithVat)})</p>

      <p>Tổng giá trị thanh lý cụ thể (đã bao gồm VAT):</p>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th className="w-8">STT</Th>
            <Th>Diễn giải</Th>
            <Th className="w-44">
              Giá trị
              <br />
              (đã bao gồm {Math.round(VAT_RATE * 100)}% VAT)
            </Th>
            <Th className="w-20">Đơn vị tính</Th>
          </tr>
        </thead>
        <tbody>
          {settlement.map(([label, value], index) => (
            <tr key={label}>
              <Td className="text-center">{index + 1}</Td>
              <Td>{label}</Td>
              <Td className="text-right">{fmt(value)}</Td>
              <Td className="text-center">VNĐ</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="italic">(Bằng chữ: {vndToWords(remaining)})</p>

      <div>
        <p className="font-bold">Sự đồng ý của hai bên:</p>
        <p>
          Bên B phải thanh toán cho Bên A số tiền còn lại là: {fmt(remaining)} VNĐ (Bằng chữ:{" "}
          {vndToWords(remaining)})
        </p>
        <p>
          Bên A phải hoàn lại cho Bên B số tiền là: {fmt(depositToRefund)} VNĐ (Bằng chữ:{" "}
          {vndToWords(depositToRefund)})
        </p>
        <p>
          Bên A phải xuất hoá đơn GTGT cho Bên B ngay sau khi hai bên ký biên bản nghiệm thu và thanh
          lý hợp đồng này.
        </p>
        <p>
          Hai Bên đồng ý ký vào biên bản thanh lý Hợp Đồng này, không có tranh chấp, khiếu nại về sau.
        </p>
        <p>
          Sau khi hai bên thực hiện đầy đủ các điều khoản trong hợp đồng thì hợp đồng số {contractRef}{" "}
          mặc nhiên được thanh lý và sẽ không còn hiệu lực thi hành.
        </p>
      </div>
      <div>
        <p className="font-bold">Điều khoản chung:</p>
        <p>Hai bên cam kết thực hiện đúng các điều khoản nêu trên.</p>
        <p className="text-justify">
          Hai bên cam kết chịu trách nhiệm trước pháp luật về quyết định nghiệm thu này và được lập
          thành hai (02) bộ gốc bằng tiếng Việt có giá trị như nhau, Bên A giữ một (01) bộ, Bên B giữ
          một (01) bộ để làm cơ sở thực hiện.
        </p>
      </div>

      <div className="grid grid-cols-2 pt-2 text-center font-bold">
        <div>
          <p>BÊN CHO THUÊ</p>
          <p>{COMPANY_INFO.representativeTitle}</p>
          <div className="h-20" />
          <p>{COMPANY_INFO.representativeName}</p>
        </div>
        <div>
          <p>BÊN THUÊ</p>
          <p>Giám đốc</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HỢP ĐỒNG DỊCH VỤ — theo file mẫu CEO gửi 2026-10-05 ("2. HỢP ĐỒNG DỊCH VỤ -
// MẪU.docx"). Câu chữ điều khoản chép nguyên văn.
// ---------------------------------------------------------------------------
function Clause({ children }: { children: ReactNode }) {
  return <p className="text-justify">- {children}</p>;
}

export function ContractDocument({ ctx }: { ctx: DocContext }) {
  const { totals, customer } = ctx;
  return (
    <div className="space-y-2.5">
      <NationalHeader />
      <div className="pt-2 text-center">
        <h1 className="text-xl font-bold">HỢP ĐỒNG DỊCH VỤ</h1>
        <p>Số: {ctx.orderCode}/TN-HĐ</p>
      </div>

      <div className="space-y-1 italic">
        <p>
          Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015 của nước Cộng Hòa Xã Hội Chủ Nghĩa Việt
          Nam và các văn bản hướng dẫn thi hành.
        </p>
        <p>
          Căn cứ Luật thương mại số 36/2005/QH11 ngày 14/06/2005 của nước Cộng Hòa Xã Hội Chủ Nghĩa Việt
          Nam và các văn bản hướng dẫn thi hành.
        </p>
        <p>
          Căn cứ Luật Doanh nghiệp số 59/2020/QH14 ngày 17/06/2020 và các văn bản sửa đổi, bổ sung,
          hướng dẫn thi hành.
        </p>
        <p>Căn cứ vào nhu cầu, khả năng và thoả thuận của hai bên.</p>
      </div>

      <p>Hôm nay {ctx.contractDateText}, chúng tôi gồm:</p>

      <div>
        <p className="font-bold">BÊN CHO THUÊ: {COMPANY_INFO.legalName}</p>
        <PartyLine label="Địa chỉ">{COMPANY_INFO.legalAddress}</PartyLine>
        <PartyLine label="Mã số thuế">{COMPANY_INFO.taxCode}</PartyLine>
        <PartyLine label="Đại diện">
          {COMPANY_INFO.representative}. Chức vụ: {COMPANY_INFO.representativeTitle}
        </PartyLine>
        <PartyLine label="Điện thoại">{COMPANY_INFO.phone}</PartyLine>
        <PartyLine label="Email">{COMPANY_INFO.email}</PartyLine>
        <p className="italic">(Dưới đây gọi tắt là Bên A)</p>
      </div>

      <div>
        <p className="font-bold">BÊN THUÊ: {customer.name}</p>
        <PartyLine label="Địa chỉ">{customer.address ?? ""}</PartyLine>
        <PartyLine label="MST">{customer.taxCode ?? ""}</PartyLine>
        {customer.budgetUnitCode && <PartyLine label="Mã số ĐVQHNS">{customer.budgetUnitCode}</PartyLine>}
        <PartyLine label="Đại diện">
          {customer.representativeName ?? `Ông/ Bà ${SHORT_DOTS}`}. Chức vụ: {customer.representativeTitle ?? SHORT_DOTS}
        </PartyLine>
        <PartyLine label="Điện thoại">{customer.phone ?? ""}</PartyLine>
        <PartyLine label="Email">{customer.email ?? ""}</PartyLine>
        <p className="italic">(Dưới đây gọi tắt là Bên B)</p>
      </div>

      <p>Bên B chỉ định Bên A là đơn vị cung cấp dịch vụ cụ thể theo các điều khoản sau:</p>

      <p className="font-bold">ĐIỀU 1: PHẠM VI DỊCH VỤ</p>
      <p>Bên B chỉ định Bên A cung cấp gói dịch vụ cho thuê thiết bị chi tiết như sau:</p>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th className="w-8">STT</Th>
            <Th>Mô tả</Th>
            <Th className="w-10">ĐVT</Th>
            <Th className="w-10">SL</Th>
            <Th className="w-12">Số ngày</Th>
            <Th>Đơn giá/ ngày (VNĐ)</Th>
            <Th>Thành tiền (VNĐ)</Th>
            <Th>{vatLabel}</Th>
            <Th>Tổng số tiền (VNĐ)</Th>
          </tr>
        </thead>
        <tbody>
          <PriceRows rows={ctx.rows} withPackageColumn={false} />
          <tr className="font-bold">
            <Td colSpan={6}>Tiền thuê</Td>
            <Td className="text-right">{fmt(totals.rental)}</Td>
            <Td className="text-right">{fmt(totals.vat)}</Td>
            <Td className="text-right">{fmt(totals.rentalWithVat)}</Td>
          </tr>
          <tr className="font-bold">
            <Td colSpan={8}>Tiền ký quỹ (đặt cọc thiết bị)</Td>
            <Td className="text-right">{fmt(totals.deposit)}</Td>
          </tr>
          <tr className="font-bold">
            <Td colSpan={8}>Tiền thuê và tiền ký quỹ</Td>
            <Td className="text-right">{fmt(totals.grand)}</Td>
          </tr>
        </tbody>
      </table>
      <p>
        <b>Bằng chữ:</b> {vndToWords(totals.grand)}.
      </p>
      <p>
        <b>Ngày nhận:</b> {ctx.pickupText}. <b>Ngày trả:</b> {ctx.returnText}.
      </p>
      <p>
        <b>Thời gian thuê:</b> {ctx.rentalDays ?? SHORT_DOTS} ngày. (24 giờ từ giờ nhận đến giờ trả thiết bị
        được tính là 01 ngày thuê). Số lượng thiết bị thuê, thời gian thuê có thể gia hạn nhưng không thể rút
        bớt.
      </p>
      <p>
        <b>Địa điểm nhận &amp; trả:</b> {ctx.placeText}
      </p>
      <p>Các dịch vụ khác do yêu cầu thêm của Bên B tại báo giá/ phụ lục hợp đồng đính kèm.</p>

      <p className="font-bold">ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG</p>
      <Clause>
        Tổng giá trị (đã bao gồm VAT): {fmt(totals.rentalWithVat)} VNĐ (Bằng chữ: {vndToWords(totals.rentalWithVat)}).
      </Clause>
      <Clause>
        Ký quỹ (đặt cọc thiết bị): {fmt(totals.deposit)} VNĐ (Bằng chữ: {vndToWords(totals.deposit)})./.(Để tránh
        nhầm lẫn, số tiền ký quỹ này mang tính đảm bảo chất lượng của thiết bị trong suốt thời gian thuê đến
        khi Bên B trả lại thiết bị.)
      </Clause>
      <Clause>
        Mọi thay đổi so với Hợp đồng về giá trị và hạng mục công việc phải được sự đồng ý giữa Bên A và Bên B
        bằng văn bản gửi qua thư điện tử hoặc gửi trực tiếp.
      </Clause>

      <p className="font-bold">ĐIỀU 3: ĐIỀU KHOẢN THANH TOÁN</p>
      <p className="font-bold">3.1 Thanh toán:</p>
      <Clause>
        <b>Thanh toán đợt 1:</b> Bên B chuyển khoản 100% số tiền thuê thiết bị: {fmt(totals.rentalWithVat)} VNĐ
        (Bằng chữ: {vndToWords(totals.rentalWithVat)}) sau khi nhận hợp đồng để bên A có căn cứ thực hiện (hợp
        đồng điện tử ký số có giá trị như hợp đồng bản cứng).
      </Clause>
      <Clause>
        <b>Thanh toán đợt 2:</b> Bên B chuyển khoản 100% số tiền ký quỹ: {fmt(totals.deposit)} VNĐ (Bằng chữ:{" "}
        {vndToWords(totals.deposit)}) trong vòng 24 giờ trước ngày nhận để Bên A tiến hành xuất kho đóng gói thiết
        bị vận chuyển tới địa điểm do Bên B yêu cầu.
      </Clause>
      <Clause>
        <b>Hoàn tiền ký quỹ:</b> Bên A chuyển khoản hoàn tiền ký quỹ (đã trừ chi phí thuê và chi phí phát sinh nếu
        có) sau khi Bên B trả lại thiết bị thuê và thanh toán đầy đủ cho Bên A, hai bên ký Biên bản nghiệm thu
        thanh lý. Hoá đơn GTGT được phát hành trong vòng 24 giờ sau khi hoàn thành dịch vụ.
      </Clause>
      <p>
        <b>3.2 Phương thức thanh toán:</b> Chuyển khoản, đồng tiền thanh toán: Việt Nam đồng.
      </p>
      <p>Tên tài khoản: {COMPANY_INFO.documentBank.accountName}</p>
      <p>
        Số tài khoản: {COMPANY_INFO.documentBank.accountNumber} tại (TECHCOMBANK) - Ngân hàng TMCP Kỹ Thương Việt
        Nam.
      </p>

      <p className="font-bold">ĐIỀU 4: TRÁCH NHIỆM CỦA CÁC BÊN</p>
      <p className="font-bold">4.1 Trách nhiệm của Bên A:</p>
      <Clause>
        Bên A cam kết cung cấp cho Bên B đầy đủ các thiết bị như đã nêu tại Điều 1 hoặc Phụ lục đính kèm của
        Hợp đồng này, đồng thời cam kết thực hiện đầy đủ các nghĩa vụ và trách nhiệm được nêu.
      </Clause>
      <Clause>
        Bên A không được đơn phương thay đổi hay chấm dứt Hợp đồng sau khi đã ký kết. Trường hợp Bên A đơn
        phương thay đổi hay chấm dứt Hợp đồng khi chưa được Bên B chấp thuận thì, Bên A phải hoàn trả toàn bộ số
        tiền mà Bên B đã tạm ứng cho hợp đồng và phải chịu phạt 30% (ba mươi phần trăm) tổng giá trị Hợp đồng.
      </Clause>
      <Clause>
        Trường hợp Bên A cung cấp thiết bị trễ so với thời gian giao ước đã được thỏa thuận tại Điều 1 hoặc Phụ
        lục đính kèm mà không thông báo trước bằng văn bản cho Bên B và không được sự đồng ý của Bên B thì Bên A
        phải trả phí phạt đến 3% trị giá tổng giá trị hợp đồng. Bên A được miễn trừ trách nhiệm về bất cứ một sự
        chậm trễ nào trong việc giao thiết bị nếu sự chậm trễ đó là do những nguyên nhân từ sự thay đổi của Bên B
        mà không thông báo bằng văn bản cho Bên A trước 24 (hai mươi tư) giờ.
      </Clause>
      <Clause>
        Bên A được miễn trừ trách nhiệm về bất cứ một sự chậm trễ nào trong việc bàn giao thiết bị nếu sự chậm
        trễ đó là do Bên A chưa nhận được tiền thanh toán hoặc tạm ứng của Bên B vào tài khoản như đã thoả thuận.
      </Clause>
      <Clause>
        Bên A có trách nhiệm kiểm tra thiết bị đầy đủ phụ kiện và hoạt động tốt khi giao hàng. (Thiết bị cần
        được vệ sinh sạch sẽ, đảm bảo tình trạng 80 – 90%).
      </Clause>
      <Clause>Thiết bị cho thuê phải đảm bảo nguồn gốc hợp pháp.</Clause>
      <Clause>
        Bên A cam kết hỗ trợ thay thế nếu thiết bị thuê trục trặc trong vòng 24 (hai mươi tư) giờ kể từ khi
        nhận được thông báo để thời gian sử dụng thiết bị không bị gián đoạn.
      </Clause>
      <Clause>Bên A có trách nhiệm xuất hoá đơn GTGT ngay sau khi nhận được thanh toán đầy đủ từ Bên B.</Clause>
      <Clause>
        Bên A được quyền đơn phương chấm dứt hợp đồng với Bên B, và thu hồi thiết bị thuê nếu Bên B không thực
        hiện đầy đủ nghĩa vụ thanh toán đối với bên B như Điều 3 của Hợp Đồng này.
      </Clause>
      <Clause>
        Bên A có trách nhiệm chuyển khoản hoàn tiền ký quỹ (đã trừ chi phí phát sinh nếu có) sau khi hai bên ký
        Biên bản nghiệm thu thanh lý.
      </Clause>
      <p className="font-bold">4.2 Trách nhiệm của Bên B:</p>
      <Clause>
        Bên B có trách nhiệm cử người đại diện kiểm tra thiết bị đầy đủ phụ kiện và hoạt động tốt khi nhận bàn
        giao từ đại diện của Bên A.
      </Clause>
      <Clause>
        Trường hợp Bên B đơn phương chấm dứt hợp đồng đã ký sẽ chịu phạt 30% giá trị hợp đồng. Bên A không phải
        chuyển lại số tiền đã nhận tạm ứng từ Bên B.
      </Clause>
      <Clause>
        Bên B có trách nhiệm cử người đại diện nhận bàn giao theo thời gian đã thoả thuận trong Phụ lục hợp đồng,
        nếu có thay đổi thời gian nhận bàn giao thì Bên B phải thông báo trước với Bên A bằng thư điện tử hoặc
        văn bản để Bên B chủ động điều phối Bên vận chuyển giao hàng. Nếu Bên B không thông báo trước bằng văn
        bản trước ít nhất 24 (hai mươi tư) giờ thì toàn bộ phí trả trễ thiết bị, phí vận chuyển phát sinh và chi
        phí lương làm thêm giờ cho người lao động phát sinh khi nhận bàn giao trễ do Bên B chi trả cho Bên vận
        chuyển và người lao động.
      </Clause>
      <Clause>
        Bên B có nghĩa vụ thanh toán đúng theo Điều 3 của hợp đồng. Trường hợp Bên B thanh toán trễ hơn so với
        thời gian giao ước đã được thỏa thuận tại Điều 3 thì Bên B phải trả phí phạt trả chậm là 1% tổng giá trị
        hợp đồng và lãi suất 0,06%/ngày trên số tiền chậm trả.
      </Clause>
      <Clause>
        Bên B không được tự ý tháo, mở, sửa chữa, thay thế phụ kiện của máy móc thiết bị của Bên A. Trong trường
        hợp Bên B tự ý tháo mở sửa chữa, thay thế, Bên A có quyền từ chối nhận lại sản phẩm và Bên B phải bồi
        thường theo giá trị của máy móc thiết bị do Bên A yêu cầu.
      </Clause>
      <Clause>
        Nếu xảy ra hư hại một phần xuất phát từ Bên B trong thời gian thuê, Bên B phải có trách nhiệm sửa chữa
        hoặc chi trả toàn bộ chi phí sửa chữa tại trung tâm do Bên A yêu cầu.
      </Clause>
      <Clause>
        Nếu xảy ra trầy xước, móp, méo, đứt, vỡ xuất phát từ Bên B trong thời gian thuê, Bên B phải có trách
        nhiệm bồi thường cho Bên A theo giá trị của máy móc thiết bị do Bên A yêu cầu dựa trên định giá thị
        trường.
      </Clause>
      <Clause>
        Nếu xảy ra hư hại toàn phần xuất phát từ Bên B trong thời gian thuê, Bên B phải có trách nhiệm bồi thường
        cho Bên A theo giá trị của máy móc thiết bị do Bên A yêu cầu dựa trên định giá thị trường.
      </Clause>
      <Clause>
        Bên B có trách nhiệm bảo quản thiết bị, đầy đủ phụ kiện và sử dụng cẩn thận khi nhận bàn giao. Bên A
        không chịu trách nhiệm về mất mát, thiếu sót phụ kiện hoặc sản phẩm không hoạt động sau khi Bên B nhận
        bàn giao và sử dụng.
      </Clause>
      <Clause>
        Bên B cam kết hoàn trả đầy đủ phụ kiện, dây cáp, sạc, bao đựng, ốp bảo vệ, túi bảo vệ và đồng thời đăng
        xuất mọi tài khoản, email, iCloud khỏi thiết bị trước khi trả hàng để Bên A nghiệm thu thiết bị.
      </Clause>
      <Clause>Nếu không làm đúng cam kết Bên B chịu mọi chi phí phát sinh đảm bảo cho việc hoàn trả thiết bị cho Bên A.</Clause>

      <p className="font-bold">ĐIỀU 5: TRANH CHẤP VÀ XỬ LÝ TRANH CHẤP</p>
      <Clause>
        Trong trường hợp xảy ra tranh chấp, Hai Bên cố gắng gặp gỡ hòa giải trên tinh thần thiện chí và hợp tác.
        Nếu vẫn không thống nhất cách giải quyết thì Hai Bên có quyền sẽ khởi kiện tại Tòa án có thẩm quyền tại
        TP.HCM xem xét giải quyết. Toàn bộ chi phí liên quan do Bên thua kiện chịu;
      </Clause>
      <Clause>
        Trong thời gian Tòa án thụ lý và chưa đưa ra phán quyết, các Bên vẫn phải tiếp tục thi hành nghĩa vụ và
        trách nhiệm của mình theo quy định của Hợp Đồng này.
      </Clause>

      <p className="font-bold">ĐIỀU 6: CÁC TRƯỜNG HỢP BẤT KHẢ KHÁNG</p>
      <Clause>
        Không Bên nào phải chịu trách nhiệm về việc chậm trễ hoặc không thể hoàn thành các nghĩa vụ được quy định
        trong Hợp đồng này nếu nguyên nhân gây ra sự chậm trễ hoặc không thực hiện đó là các tình huống bất khả
        kháng như đình công, hỏa hoạn, lũ lụt, thiên tai, động đất, dịch bệnh theo văn bản thông báo của cơ quan
        Nhà nước có thẩm quyền hoặc bất cứ các quy định, điều luật của cơ quan nhà nước có thẩm quyền hoặc các
        tình huống khác nằm ngoài khả năng kiểm soát của bên tham gia Hợp đồng mà không thể dự báo trước.
      </Clause>
      <Clause>
        Bên gặp Sự kiện bất khả kháng như quy định ở khoản 1 điều này cần thông báo cho Bên còn lại bằng văn bản
        trong vòng 03 ngày kể từ ngày xảy ra Sự kiện bất khả kháng để thông báo về (i) Sự kiện bất khả kháng và
        các biện pháp được áp dụng để giảm thiểu hậu quả của sự kiện bất khả kháng, và/hoặc (ii) việc một Bên
        không thể thực hiện được nghĩa vụ theo Hợp đồng hoặc kéo dài thời gian thực hiện Hợp đồng tương ứng. Việc
        một Bên không hoàn thành hoặc hoàn thành không đầy đủ nghĩa vụ theo Hợp đồng do Sự kiện bất khả kháng sau
        khi thực hiện nghĩa vụ khắc phục hậu quả và thông báo được miễn trách nhiệm do hành vi vi phạm Hợp đồng
        của mình phát sinh từ Sự kiện bất khả kháng. Nếu có đề nghị bất thường, hai bên sẽ thỏa thuận thông qua
        đàm phán.
      </Clause>
      <Clause>
        Trong trường hợp xảy ra sự kiện bất khả kháng, thời gian thực hiện Hợp đồng sẽ được kéo dài bằng thời
        gian diễn ra sự kiện bất khả kháng mà Bên bị ảnh hưởng không thể thực hiện các nghĩa vụ theo Hợp Đồng mà
        Hai Bên đã ký.
      </Clause>

      <p className="font-bold">ĐIỀU 7: ĐIỀU KHOẢN CHUNG</p>
      <Clause>Các bên không được chuyển nhượng Hợp đồng này dưới bất kỳ hình thức nào.</Clause>
      <Clause>
        Hợp đồng này có hiệu lực từ ngày ký và được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như
        nhau. Hợp đồng sẽ tự thanh lý ngay khi kết thúc thời gian thuê máy và thiết bị nếu không có phát sinh
        thêm.
      </Clause>

      <div className="grid grid-cols-2 pt-4 text-center font-bold">
        <div>
          <p>ĐẠI DIỆN BÊN CHO THUÊ</p>
          <p>{COMPANY_INFO.representativeTitle}</p>
          <div className="h-24" />
          <p>{COMPANY_INFO.representativeName}</p>
        </div>
        <div>
          <p>ĐẠI DIỆN BÊN THUÊ</p>
          <p>{customer.representativeTitle ?? ""}</p>
          <div className="h-24" />
          <p>{customer.representativeName?.replace(/^(Ông|Bà)\/?\s*(Bà)?\s*/i, "").toUpperCase() ?? ""}</p>
        </div>
      </div>
    </div>
  );
}
