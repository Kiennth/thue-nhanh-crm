import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRowsByIds } from "@/lib/supabase/fetch-all";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { VAT_RATE } from "@/lib/order-labels";
import { VN_TIME_ZONE } from "@/lib/date-format";
import {
  RENTAL_PERIOD_UNIT_LABELS,
  equipmentDetailLabel,
  equipmentInstanceLabel,
} from "@/lib/equipment-labels";
import type { RentalPeriodUnit } from "@/types/database";
import { COMPANY_INFO } from "@/lib/company-info";
import { PRINT_DOC_TERMS, PRINT_DOC_TITLES, PRINT_DOC_TYPES, printDocFileName, type PrintDocType } from "@/lib/print-docs";
import type { Metadata } from "next";
import { DELIVERY_NOTE_TYPE_IDS } from "@/lib/commission";
import { computeRentalDurationInUnit } from "@/lib/rental-pricing";
import {
  buildDocRows,
  computeDocTotals,
  computeOrderDeposit,
  type DocEquipmentType,
} from "@/lib/order-document-data";
import {
  AcceptanceDocument,
  HandoverDocument,
  PaymentRequestDocument,
  QuoteDocument,
  type DocContext,
} from "./documents";
import { PrintButton, type GoogleDocsState } from "./print-button";
import { getDriveIntegration, getOrderGoogleDoc, googleClientConfig } from "@/lib/google-drive";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

function isPrintDocType(value: string | undefined): value is PrintDocType {
  return !!value && (PRINT_DOC_TYPES as string[]).includes(value);
}

// Ghi chú hiển thị của dòng (phụ kiện đi kèm, địa chỉ + SĐT giao/thu hồi) in
// ngay dưới tên hàng — như chứng từ Booqable.
function lineNote(note: string | null) {
  if (!note) return null;
  return <span className="block text-xs font-normal whitespace-pre-wrap text-neutral-500">{note}</span>;
}

// Dòng sửa tay số kỳ tính tiền (khách cầm 5 ngày, tính 3 ngày — CEO
// 2026-09-26) ghi rõ trên chứng từ để khách hiểu đơn giá.
function chargeNote(chargeDuration: number | null, unit: RentalPeriodUnit | null | undefined) {
  if (chargeDuration == null || !unit) return null;
  return (
    <span className="block text-xs text-neutral-500">
      Tính {chargeDuration} {RENTAL_PERIOD_UNIT_LABELS[unit]}
    </span>
  );
}

// Tiêu đề tab = tên file khi bấm "In / Lưu PDF" (trình duyệt lấy title làm
// tên file mặc định) — theo mẫu CEO: "BAO GIA PO DH20261001-871".
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; google?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { type } = await searchParams;
  const docType: PrintDocType = isPrintDocType(type) ? type : "contract";
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("order_code").eq("id", id).single();
  return { title: order ? printDocFileName(docType, order.order_code) : PRINT_DOC_TITLES[docType] };
}

export default async function OrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; google?: string }>;
}) {
  const viewer = await requireRole([...ALL_ROLES]);

  const { id } = await params;
  const { type, google: googleNotice } = await searchParams;
  const docType: PrintDocType = isPrintDocType(type) ? type : "contract";

  // Nút Google Docs (CEO 2026-10-04) — trạng thái kết nối Drive + file đã tạo.
  const canUseGoogle = MANAGE_ROLES.includes(viewer.role);
  const [driveIntegration, existingGoogleDoc] = canUseGoogle
    ? await Promise.all([getDriveIntegration(), getOrderGoogleDoc(id, docType)])
    : [null, null];
  const google: GoogleDocsState = {
    canUse: canUseGoogle,
    canConnect: viewer.role === "giam_doc",
    configured: !!googleClientConfig(),
    connected: !!driveIntegration,
    existingUrl: existingGoogleDoc?.url ?? null,
    notice: googleNotice ?? null,
    connectHref: `/api/google/connect?return=${encodeURIComponent(`/orders/${id}/print?type=${docType}`)}`,
  };
  const printButton = <PrintButton orderId={id} docType={docType} google={google} />;

  const supabase = await createClient();
  const [
    { data: order },
    { data: lines },
    { data: branches },
    { data: equipmentTypes },
    { data: equipmentUnits },
  ] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_equipment").select("*").eq("order_id", id).order("position"),
    supabase.from("branches").select("id, name"),
    supabase
      .from("equipment_types")
      .select("id, name, rental_period_unit, product_type, tracking_type, deposit_amount"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
  ]);

  if (!order) notFound();

  // equipment_instances đã hơn 1.700 dòng — Supabase/PostgREST chặn CỨNG ở
  // 1.000 dòng/lần gọi kể cả khi request .range() rộng hơn (không lỗi, chỉ
  // âm thầm cắt bớt). Trang in chỉ cần đúng các máy được dòng đơn này tham
  // chiếu nên tra thẳng theo ID thay vì nạp nguyên bảng — đảm bảo đúng bất
  // kể tổng số máy trong hệ thống, cũng nhẹ hơn nhiều cho 1 trang in.
  const instanceIds = [
    ...new Set((lines ?? []).map((l) => l.equipment_instance_id).filter((v): v is string => !!v)),
  ];
  const equipmentInstances = await fetchRowsByIds<{
    id: string;
    equipment_type_id: string;
    equipment_unit_id: string | null;
    identifier_code: string;
  }>(instanceIds, (idChunk, from, to) =>
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, equipment_unit_id, identifier_code")
      .in("id", idChunk)
      .range(from, to),
  );

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", order.customer_id)
    .maybeSingle();

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const printedNotes = new Set<string>();
  const equipmentTypeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const equipmentUnitById = new Map((equipmentUnits ?? []).map((u) => [u.id, u]));
  const equipmentInstanceById = new Map((equipmentInstances ?? []).map((i) => [i.id, i]));
  // Loại hàng chỉ có 1 biến thể → ẩn tên biến thể trên chứng từ (chỉ lặp
  // tên sản phẩm) — cùng quy tắc với trang chi tiết đơn.
  const unitCountByType = new Map<string, number>();
  for (const u of equipmentUnits ?? []) {
    unitCountByType.set(u.equipment_type_id, (unitCountByType.get(u.equipment_type_id) ?? 0) + 1);
  }

  const vatAmount = Math.round(order.total_value * VAT_RATE * 100) / 100;
  const grandTotal = order.total_value + vatAmount;

  // Biên bản bàn giao/thu hồi là chứng từ KIỂM ĐẾM — chỉ danh mục + số lượng,
  // không hiện tiền (CEO 2026-09-01): người ký là kỹ thuật/khách tại hiện
  // trường, giá cả đã nằm ở hợp đồng/báo giá.
  const showPrices = docType !== "handover" && docType !== "collection";

  // Báo giá / Đề nghị thanh toán / Biên bản bàn giao / Biên bản nghiệm thu in
  // theo đúng file mẫu CEO gửi 2026-09-30 (documents.tsx). Hợp đồng và biên
  // bản thu hồi chưa có mẫu → vẫn dùng khuôn chung bên dưới.
  const TEMPLATE_DOCS: PrintDocType[] = ["quote", "payment_request", "handover", "acceptance"];
  if (TEMPLATE_DOCS.includes(docType)) {
    const { data: payments } = await supabase
      .from("order_payments")
      .select("amount, payment_type")
      .eq("order_id", id);
    const sumPayments = (paymentType: string) =>
      (payments ?? []).filter((p) => p.payment_type === paymentType).reduce((sum, p) => sum + p.amount, 0);

    const typeById = new Map<string, DocEquipmentType>((equipmentTypes ?? []).map((t) => [t.id, t]));
    const rows = buildDocRows({
      lines: lines ?? [],
      typeById,
      unitNameById: new Map((equipmentUnits ?? []).map((u) => [u.id, u.brand_model])),
      unitCountByType,
      instanceCodeById: new Map((equipmentInstances ?? []).map((i) => [i.id, i.identifier_code])),
      rentalStartAt: order.rental_start_at,
      rentalEndAt: order.rental_end_at,
    });
    const deposit = computeOrderDeposit({
      lines: lines ?? [],
      typeById,
      customerDepositPercentage: customer?.deposit_percentage ?? 100,
      depositOverrideAmount: order.deposit_override_amount,
    });

    const vnParts = (iso: string | null) => {
      if (!iso) return null;
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: VN_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(iso));
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      return { day: get("day"), month: get("month"), year: get("year"), time: `${get("hour")}:${get("minute")}` };
    };
    const start = vnParts(order.rental_start_at);
    const end = vnParts(order.rental_end_at);
    const [orderYear, orderMonth, orderDay] = order.order_date.split("-");

    const branchName = branchNameById.get(order.pickup_branch_id) ?? "";
    const city = /hcm|hồ chí minh/i.test(branchName)
      ? "TP. Hồ Chí Minh"
      : branchName || "TP. Hồ Chí Minh";
    // Địa điểm nhận & trả: lấy ghi chú địa chỉ trên dòng phí giao/thu hồi; khách
    // tự đến lấy thì là kho giao.
    const deliveryNotes = [
      ...new Set(
        (lines ?? [])
          .filter(
            (l) =>
              l.equipment_type_id &&
              DELIVERY_NOTE_TYPE_IDS.has(l.equipment_type_id) &&
              l.extra_information?.trim(),
          )
          .map((l) => l.extra_information!.trim().replace(/\s*\n+\s*/g, " - ")),
      ),
    ];

    // Cột mới chưa có trong types/database.ts (WIP phiên khác).
    const extra = customer as {
      representative_name?: string | null;
      representative_title?: string | null;
      bank_account_number?: string | null;
      bank_name?: string | null;
    } | null;
    const ctx: DocContext = {
      docNumber: `${order.order_code}/TN`,
      orderCode: order.order_code,
      contractDateText: `ngày ${orderDay} tháng ${orderMonth} năm ${orderYear}`,
      orderDate: `${orderDay}/${orderMonth}/${orderYear}`,
      city,
      customer: {
        name: customer?.name ?? "—",
        address: customer?.address ?? null,
        taxCode: customer?.tax_code ?? null,
        budgetUnitCode: (customer as { budget_unit_code?: string | null } | null)?.budget_unit_code ?? null,
        representativeName: extra?.representative_name || null,
        representativeTitle: extra?.representative_title || null,
        bankAccountNumber: extra?.bank_account_number || null,
        bankName: extra?.bank_name || null,
        phone: customer?.phone ?? null,
        email: customer?.email ?? null,
      },
      rows,
      totals: computeDocTotals(rows, deposit),
      pickupText: start ? `${start.time} ngày ${start.day}/${start.month}/${start.year}` : "",
      returnText: end ? `${end.time} ngày ${end.day}/${end.month}/${end.year}` : "",
      pickupDateParts: start ? { day: start.day, month: start.month, year: start.year } : null,
      returnDateText: end ? `ngày ${end.day} tháng ${end.month} năm ${end.year}` : "ngày … tháng … năm …",
      rentalDays:
        order.rental_start_at && order.rental_end_at
          ? computeRentalDurationInUnit(order.rental_start_at, order.rental_end_at, "day")
          : null,
      placeText: deliveryNotes.length ? deliveryNotes.join(" / ") : `Kho Thuê Nhanh ${branchName}`.trim(),
      paid: sumPayments("invoice"),
      depositHeld: sumPayments("deposit_collect") - sumPayments("deposit_refund"),
    };

    return (
      <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
        <style>{`@page { size: A4; margin: 1.5cm; }`}</style>
        <div
          data-doc-root
          className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-5 text-black shadow print:max-w-none print:p-0 print:shadow-none"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {printButton}
          {docType === "quote" && <QuoteDocument ctx={ctx} />}
          {docType === "payment_request" && <PaymentRequestDocument ctx={ctx} />}
          {docType === "handover" && <HandoverDocument ctx={ctx} />}
          {docType === "acceptance" && <AcceptanceDocument ctx={ctx} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 1.5cm; }`}</style>
      <div
        data-doc-root
        className="mx-auto max-w-3xl bg-white p-10 text-sm text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none"
      >
        {printButton}

        <div className="flex justify-between gap-6">
          <div>
            <p className="font-semibold">{COMPANY_INFO.name}</p>
            {COMPANY_INFO.taxCode && <p>MST: {COMPANY_INFO.taxCode}</p>}
            {COMPANY_INFO.address && <p>{COMPANY_INFO.address}</p>}
            <p>{COMPANY_INFO.phone}</p>
            <p>{COMPANY_INFO.email}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{customer?.name ?? "—"}</p>
            {customer?.phone && <p>{customer.phone}</p>}
            {customer?.email && <p>{customer.email}</p>}
            {customer?.address && <p>{customer.address}</p>}
            {customer?.tax_code && <p>MST: {customer.tax_code}</p>}
            {(customer as { budget_unit_code?: string | null } | null)?.budget_unit_code && (
              <p>Mã số ĐVQHNS: {(customer as { budget_unit_code?: string | null }).budget_unit_code}</p>
            )}
          </div>
        </div>

        <h1 className="mt-10 text-center text-xl font-bold tracking-wide">
          {PRINT_DOC_TITLES[docType]} #{order.order_code}
        </h1>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1">
          <p>
            <span className="text-neutral-500">Ngày lập:</span> {order.order_date}
          </p>
          <p>
            <span className="text-neutral-500">Chi nhánh giao:</span>{" "}
            {branchNameById.get(order.pickup_branch_id) ?? "—"}
          </p>
          <p>
            <span className="text-neutral-500">Nhận hàng:</span>{" "}
            {order.rental_start_at ? dateTimeFormatter.format(new Date(order.rental_start_at)) : "—"}
          </p>
          <p>
            <span className="text-neutral-500">Chi nhánh nhận trả:</span>{" "}
            {branchNameById.get(order.return_branch_id) ?? "—"}
          </p>
          <p>
            <span className="text-neutral-500">Trả hàng:</span>{" "}
            {order.rental_end_at ? dateTimeFormatter.format(new Date(order.rental_end_at)) : "—"}
          </p>
        </div>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="py-2 font-medium">Hàng hoá</th>
              <th className="py-2 font-medium">Chi tiết</th>
              <th className="py-2 text-right font-medium">SL</th>
              {showPrices && <th className="py-2 text-right font-medium">Đơn giá</th>}
              {showPrices && <th className="py-2 text-right font-medium">Thành tiền</th>}
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).filter((line) => !line.parent_line_id).flatMap((line) => {
              // Máy serial cùng sản phẩm in mỗi máy 1 dòng nhưng dùng chung 1
              // ghi chú — chỉ in ghi chú ở dòng đầu, khỏi lặp.
              const noteOnce = (l: typeof line) => {
                if (!l.extra_information) return null;
                const key = `${l.equipment_type_id ?? l.custom_name}|${l.extra_information}`;
                if (printedNotes.has(key)) return null;
                printedNotes.add(key);
                return l.extra_information;
              };
              const equipmentType = line.equipment_type_id
                ? equipmentTypeById.get(line.equipment_type_id)
                : undefined;
              const lineInstance = line.equipment_instance_id
                ? equipmentInstanceById.get(line.equipment_instance_id)
                : undefined;
              const rawDetail = line.equipment_unit_id
                ? equipmentUnitById.get(line.equipment_unit_id)?.brand_model
                : lineInstance
                  ? equipmentInstanceLabel(
                      lineInstance.equipment_unit_id
                        ? equipmentUnitById.get(lineInstance.equipment_unit_id)?.brand_model
                        : null,
                      lineInstance.identifier_code,
                    )
                  : null;
              const detail = equipmentDetailLabel(equipmentType?.name, rawDetail, {
                soleVariant:
                  !!line.equipment_unit_id &&
                  !!equipmentType &&
                  unitCountByType.get(equipmentType.id) === 1,
              });
              // Combo (CEO 2026-09-26): khách thấy 1 dòng giá bộ, các món bên
              // trong liệt kê ngay dưới, không tách giá từng món.
              const children = (lines ?? []).filter((l) => l.parent_line_id === line.id);
              if (children.length) {
                const comboTotal = children.reduce((sum, c) => sum + c.line_total, 0);
                return [
                  <tr key={line.id} className="border-b border-neutral-100">
                    <td className="py-2 font-medium">
                      {equipmentType?.name ?? "—"}
                      {lineNote(line.extra_information)}
                    </td>
                    <td className="py-2 text-neutral-500">
                      Combo gồm:{chargeNote(line.charge_duration, equipmentType?.rental_period_unit)}
                    </td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    {showPrices && (
                      <td className="py-2 text-right">
                        {currencyFormatter.format(comboTotal / Math.max(1, line.quantity))}đ
                      </td>
                    )}
                    {showPrices && (
                      <td className="py-2 text-right">{currencyFormatter.format(comboTotal)}đ</td>
                    )}
                  </tr>,
                  ...children.map((child, index) => {
                    const childType = child.equipment_type_id
                      ? equipmentTypeById.get(child.equipment_type_id)
                      : undefined;
                    const childInstance = child.equipment_instance_id
                      ? equipmentInstanceById.get(child.equipment_instance_id)
                      : undefined;
                    const childDetail = child.equipment_unit_id
                      ? equipmentUnitById.get(child.equipment_unit_id)?.brand_model
                      : (childInstance?.identifier_code ?? null);
                    return (
                      <tr
                        key={child.id}
                        className={
                          index === children.length - 1
                            ? "border-b border-neutral-200 text-neutral-600"
                            : "text-neutral-600"
                        }
                      >
                        <td className="py-1 pl-4">• {childType?.name ?? "—"}</td>
                        <td className="py-1">
                          {equipmentDetailLabel(childType?.name, childDetail ?? null, {
                            soleVariant:
                              !!child.equipment_unit_id &&
                              !!childType &&
                              unitCountByType.get(childType.id) === 1,
                          })}
                        </td>
                        <td className="py-1 text-right">{child.quantity}</td>
                        {showPrices && <td />}
                        {showPrices && <td />}
                      </tr>
                    );
                  }),
                ];
              }
              return [
                <tr key={line.id} className="border-b border-neutral-200">
                  <td className="py-2">
                    {equipmentType?.name ?? line.custom_name ?? "—"}
                    {lineNote(noteOnce(line))}
                  </td>
                  <td className="py-2">
                    {detail}
                    {chargeNote(line.charge_duration, equipmentType?.rental_period_unit)}
                  </td>
                  <td className="py-2 text-right">{line.quantity}</td>
                  {showPrices && (
                    <td className="py-2 text-right">{currencyFormatter.format(line.unit_price)}đ</td>
                  )}
                  {showPrices && (
                    <td className="py-2 text-right">{currencyFormatter.format(line.line_total)}đ</td>
                  )}
                </tr>,
              ];
            })}
            {!lines?.length && (
              <tr>
                <td colSpan={showPrices ? 5 : 3} className="py-4 text-center text-neutral-400">
                  Chưa có dòng hàng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {showPrices && (
          <div className="mt-4 flex flex-col items-end gap-1">
            <p>Tạm tính (chưa VAT): {currencyFormatter.format(order.total_value)}đ</p>
            <p>
              VAT ({VAT_RATE * 100}%): {currencyFormatter.format(vatAmount)}đ
            </p>
            <p className="text-base font-semibold">
              Tổng cộng: {currencyFormatter.format(grandTotal)}đ
            </p>
          </div>
        )}

        {(docType === "contract" || docType === "quote") && (
          <div className="mt-6 space-y-1">
            <p className="font-semibold">Thông tin chuyển khoản</p>
            <p>Chủ tài khoản: {COMPANY_INFO.bankAccountName}</p>
            {COMPANY_INFO.bankAccounts.map((account) => (
              <p key={account.bankName}>
                {account.bankName}: {account.accountNumber}
              </p>
            ))}
          </div>
        )}

        <div className="mt-10 space-y-4">
          {PRINT_DOC_TERMS[docType].map((section) => (
            <div key={section.heading} className="space-y-1">
              <p className="font-semibold uppercase">{section.heading}</p>
              <ul className="list-inside list-disc space-y-1 text-neutral-700">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-20 grid grid-cols-2 gap-6 text-center">
          <div>
            <p className="font-semibold">ĐẠI DIỆN BÊN THUÊ</p>
            <p className="text-xs text-neutral-500">(Ký & ghi rõ họ tên)</p>
          </div>
          <div>
            <p className="font-semibold">ĐẠI DIỆN BÊN CHO THUÊ</p>
            <p className="text-xs text-neutral-500">(Ký & ghi rõ họ tên)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
