import type { ReactNode } from "react";
import { COMPANY_INFO } from "@/lib/company-info";
import { VAT_RATE } from "@/lib/order-labels";
import { vndToWords } from "@/lib/vnd-words";
import type { DocRow, DocTotals } from "@/lib/order-document-data";

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
  paid: number;
  depositHeld: number;
}

const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const fmt = (n: number) => money.format(n);
const DOTS = "……………………………………";
const SHORT_DOTS = "………";
const vatLabel = `VAT (${Math.round(VAT_RATE * 100)}%)`;

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

// Bảng giá 9 cột dùng chung cho Báo giá (có thêm cột "Đơn giá/gói") và Biên
// bản nghiệm thu.
function PriceRows({ rows, withPackageColumn }: { rows: DocRow[]; withPackageColumn: boolean }) {
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
export function QuoteDocument({ ctx }: { ctx: DocContext }) {
  const { totals } = ctx;
  return (
    <div className="space-y-3">
      <div className="text-center">
        <h1 className="text-xl font-bold">BÁO GIÁ</h1>
        <p>Số: {ctx.docNumber}</p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold">BÊN A: {COMPANY_INFO.legalName}</p>
          <p>Địa chỉ: {COMPANY_INFO.legalAddress}</p>
          <p>Mã số thuế: {COMPANY_INFO.taxCode}</p>
          <p>
            Người đại diện: {COMPANY_INFO.representative}. Chức vụ: {COMPANY_INFO.representativeTitle}
          </p>
          <p>SĐT: {COMPANY_INFO.phone}</p>
          <p>Email: {COMPANY_INFO.email}</p>
        </div>
        <table className="shrink-0 border-collapse">
          <tbody>
            <tr>
              <Td className="font-bold">Ngày</Td>
              <Td className="min-w-24 text-center">{ctx.orderDate}</Td>
            </tr>
            <tr>
              <Td className="font-bold">Số thứ tự</Td>
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
        <p className="font-bold">BÊN B: {ctx.customer.name}</p>
        <p>Địa chỉ: {ctx.customer.address ?? ""}</p>
        <p>MST: {ctx.customer.taxCode ?? ""}</p>
        {ctx.customer.budgetUnitCode && <p>Mã số ĐVQHNS: {ctx.customer.budgetUnitCode}</p>}
        <p>
          Người đại diện: {ctx.customer.representativeName ?? `Ông/ Bà ${SHORT_DOTS}`} Chức vụ:{" "}
          {ctx.customer.representativeTitle ?? SHORT_DOTS}
        </p>
        {ctx.customer.bankAccountNumber && (
          <p>
            Số tài khoản: {ctx.customer.bankAccountNumber}
            {ctx.customer.bankName ? ` tại ${ctx.customer.bankName}` : ""}
          </p>
        )}
        <p>SĐT: {ctx.customer.phone ?? ""}</p>
        <p>Email: {ctx.customer.email ?? ""}</p>
      </div>

      <p>
        Bên A đáp ứng đủ tiêu chuẩn để cung cấp dịch vụ cho thuê thiết bị theo yêu cầu của Bên B, cụ
        thể như sau:
      </p>

      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th className="w-8">STT</Th>
            <Th>Mô tả</Th>
            <Th className="w-10">ĐVT</Th>
            <Th className="w-12">Số lượng</Th>
            <Th className="w-12">Số ngày</Th>
            <Th>Đơn giá/ ngày (VNĐ)</Th>
            <Th>Đơn giá/ gói (VNĐ)</Th>
            <Th>Thành tiền (VNĐ)</Th>
            <Th>{vatLabel}</Th>
            <Th>Tổng số tiền (VNĐ)</Th>
          </tr>
        </thead>
        <tbody>
          <PriceRows rows={ctx.rows} withPackageColumn />
          <tr className="font-bold">
            <Td />
            <Td colSpan={6}>Tiền thuê</Td>
            <Td className="text-right">{fmt(totals.rental)}</Td>
            <Td className="text-right">{fmt(totals.vat)}</Td>
            <Td className="text-right">{fmt(totals.rentalWithVat)}</Td>
          </tr>
          <tr className="font-bold">
            <Td />
            <Td colSpan={8}>Tiền ký quỹ (đặt cọc thiết bị)</Td>
            <Td className="text-right">{fmt(totals.deposit)}</Td>
          </tr>
          <tr className="font-bold">
            <Td />
            <Td colSpan={8}>Tiền thuê và tiền ký quỹ</Td>
            <Td className="text-right">{fmt(totals.grand)}</Td>
          </tr>
        </tbody>
      </table>

      <div className="space-y-1">
        <p>
          <b>Tiền thuê:</b> {fmt(totals.rentalWithVat)} VNĐ (Bằng chữ: {vndToWords(totals.rentalWithVat)}).
        </p>
        <p>
          <b>Tiền ký quỹ:</b> {fmt(totals.deposit)} VNĐ (Bằng chữ: {vndToWords(totals.deposit)})./.(Để
          tránh nhầm lẫn, khoản tiền ký quỹ (đặt cọc thiết bị) này mang tính đảm bảo chất lượng của
          thiết bị thuê trong suốt quá trình diễn ra sự kiện đến khi Bên B trả lại thiết bị thì Bên A
          phải hoàn trả cho Bên B)
        </p>
        <p>
          <b>Ngày nhận:</b> {ctx.pickupText}
        </p>
        <p>
          <b>Ngày trả:</b> {ctx.returnText}
        </p>
        <p>
          <b>Thời gian thuê:</b> {ctx.rentalDays ?? SHORT_DOTS} ngày. (24 giờ từ giờ nhận đến giờ trả
          thiết bị được tính là 01 ngày thuê). Số lượng thiết bị thuê, thời gian thuê có thể gia hạn
          nhưng không thể rút bớt.
        </p>
        <p>
          <b>Địa điểm nhận &amp; trả:</b> {ctx.placeText}
        </p>
        <p>
          <b>Thanh toán đợt 1:</b> Bên B chuyển khoản 100% số tiền thuê: {fmt(totals.rentalWithVat)} VNĐ
          (Bằng chữ: {vndToWords(totals.rentalWithVat)}) ngay sau khi nhận báo giá để báo giá có hiệu
          lực.
        </p>
        <p>
          <b>Thanh toán đợt 2:</b> Bên B chuyển khoản 100% số tiền ký quỹ: {fmt(totals.deposit)} VNĐ
          (Bằng chữ: {vndToWords(totals.deposit)}) trong vòng 24 giờ trước ngày nhận để Bên A làm thủ
          tục xuất kho đóng gói vận chuyển tới địa điểm do Bên B yêu cầu.
        </p>
        <p>
          <b>Tên tài khoản:</b> {COMPANY_INFO.documentBank.accountName}
          <br />
          <b>Số tài khoản:</b> {COMPANY_INFO.documentBank.accountNumber} tại (TECHCOMBANK) - Ngân hàng
          TMCP Kỹ Thương Việt Nam. CN: Hồ Chí Minh.
        </p>
        <p>
          <b>Hoàn cọc:</b> Bên A chuyển khoản hoàn tiền ký quỹ (sau khi trừ chi phí phát sinh nếu có)
          sau khi bên B trả lại thiết bị cho bên A, tối đa 24h làm việc.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <div className="w-64 text-center">
          <p className="font-bold">{COMPANY_INFO.name}</p>
          <p className="font-bold">{COMPANY_INFO.representativeTitle}</p>
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
        <PartyLine label="MST">{ctx.customer.taxCode ?? ""}</PartyLine>
        {ctx.customer.budgetUnitCode && (
          <PartyLine label="Mã số ĐVQHNS">{ctx.customer.budgetUnitCode}</PartyLine>
        )}
        <PartyLine label="Người nhận">{DOTS}</PartyLine>
        <PartyLine label="Số điện thoại">{DOTS}</PartyLine>
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
            <Th className="w-44">Serial Number</Th>
            <Th className="w-28">Tình trạng</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              <Td className="text-center">{index + 1}</Td>
              <Td>
                <RowDescription row={row} />
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
              <Td />
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <Td colSpan={6} className="text-center">
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
