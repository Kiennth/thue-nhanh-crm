import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { VAT_RATE } from "@/lib/order-labels";
import { COMPANY_INFO } from "@/lib/company-info";
import { PRINT_DOC_TERMS, PRINT_DOC_TITLES, type PrintDocType } from "@/lib/print-docs";
import { PrintButton } from "./print-button";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

const PRINT_DOC_TYPES: PrintDocType[] = ["contract", "quote", "handover", "collection", "acceptance"];

function isPrintDocType(value: string | undefined): value is PrintDocType {
  return !!value && (PRINT_DOC_TYPES as string[]).includes(value);
}

export default async function OrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requireRole([...ALL_ROLES]);

  const { id } = await params;
  const { type } = await searchParams;
  const docType: PrintDocType = isPrintDocType(type) ? type : "contract";

  const supabase = await createClient();
  const [
    { data: order },
    { data: lines },
    { data: branches },
    { data: equipmentTypes },
    { data: equipmentUnits },
    { data: equipmentInstances },
  ] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_equipment").select("*").eq("order_id", id).order("created_at"),
    supabase.from("branches").select("id, name"),
    supabase.from("equipment_types").select("id, name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
    supabase.from("equipment_instances").select("id, equipment_type_id, identifier_code"),
  ]);

  if (!order) notFound();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, address, tax_code")
    .eq("id", order.customer_id)
    .maybeSingle();

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const equipmentTypeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const equipmentUnitById = new Map((equipmentUnits ?? []).map((u) => [u.id, u]));
  const equipmentInstanceById = new Map((equipmentInstances ?? []).map((i) => [i.id, i]));

  const vatAmount = Math.round(order.total_value * VAT_RATE * 100) / 100;
  const grandTotal = order.total_value + vatAmount;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 1.5cm; }`}</style>
      <div className="mx-auto max-w-3xl bg-white p-10 text-sm text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <PrintButton />

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
              <th className="py-2 text-right font-medium">Đơn giá</th>
              <th className="py-2 text-right font-medium">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((line) => {
              const equipmentType = line.equipment_type_id
                ? equipmentTypeById.get(line.equipment_type_id)
                : undefined;
              const detail = line.equipment_unit_id
                ? equipmentUnitById.get(line.equipment_unit_id)?.brand_model
                : line.equipment_instance_id
                  ? equipmentInstanceById.get(line.equipment_instance_id)?.identifier_code
                  : null;
              return (
                <tr key={line.id} className="border-b border-neutral-200">
                  <td className="py-2">{equipmentType?.name ?? line.custom_name ?? "—"}</td>
                  <td className="py-2">{detail ?? "—"}</td>
                  <td className="py-2 text-right">{line.quantity}</td>
                  <td className="py-2 text-right">{currencyFormatter.format(line.unit_price)}đ</td>
                  <td className="py-2 text-right">{currencyFormatter.format(line.line_total)}đ</td>
                </tr>
              );
            })}
            {!lines?.length && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-neutral-400">
                  Chưa có dòng hàng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col items-end gap-1">
          <p>Tạm tính (chưa VAT): {currencyFormatter.format(order.total_value)}đ</p>
          <p>
            VAT ({VAT_RATE * 100}%): {currencyFormatter.format(vatAmount)}đ
          </p>
          <p className="text-base font-semibold">
            Tổng cộng: {currencyFormatter.format(grandTotal)}đ
          </p>
        </div>

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
