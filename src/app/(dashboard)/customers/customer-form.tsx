"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createCustomer, findDuplicateCustomer, updateCustomer } from "@/lib/actions/customers";
import {
  cccdProvinceWarning,
  maskIdNumber,
  validateCustomer,
  customerWarnings,
  type CustomerKind,
} from "@/lib/customer-validation";

export interface CustomerFormValues {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  customer_type: CustomerKind;
  tax_code: string | null;
  contact_name?: string | null;
  wants_vat?: boolean;
  invoice_email?: string | null;
  budget_unit_code?: string | null;
  representative_name?: string | null;
  representative_title?: string | null;
  bank_account_number?: string | null;
  bank_name?: string | null;
  address: string | null;
  deposit_percentage: number;
}

const Req = () => <span className="font-bold text-red-500">*</span>;

// Form khách Công ty / Cá nhân (B6, Grok CRM 09/10 — CEO duyệt): Loại khách
// đứng đầu, mặc định Công ty; đổi loại thì đổi bộ trường, giữ SĐT/email/địa
// chỉ. Trường bắt buộc có * đỏ, lỗi hiện khi rời ô, Lưu khoá khi còn lỗi. Rời
// ô SĐT / MST / CCCD thì báo nếu đã có khách trùng.
export function CustomerForm({
  customer,
  canViewIdNumber,
  defaultName,
  onDone,
  onClose,
}: {
  customer?: CustomerFormValues;
  // Giám đốc / Admin / Kế toán xem & sửa số CCCD đủ; vai trò khác thấy
  // "1234xxxx" và để trống = giữ nguyên số cũ.
  canViewIdNumber: boolean;
  defaultName?: string;
  onDone: (saved: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CustomerKind>(customer?.customer_type ?? "company");
  const [name, setName] = useState(customer?.name ?? defaultName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  // 1 ô tax_code (CEO 09/10): công ty = MST; cá nhân = CCCD (= MST cá nhân).
  // Cá nhân mà người sửa không được xem số đủ → ô trống, để trống = giữ số cũ.
  const hideIndividualId = customer?.customer_type === "individual" && !!customer?.tax_code && !canViewIdNumber;
  const [taxCode, setTaxCode] = useState(hideIndividualId ? "" : (customer?.tax_code ?? ""));
  const [wantsVat, setWantsVat] = useState(customer?.wants_vat ?? false);
  const [invoiceEmail, setInvoiceEmail] = useState(customer?.invoice_email ?? "");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const [dup, setDup] = useState<{ field: string; id: string; name: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errors = useMemo(
    () =>
      validateCustomer({
        customer_type: kind,
        name,
        phone,
        email,
        contact_name: contactName,
        tax_code: taxCode,
        wants_vat: wantsVat,
        invoice_email: invoiceEmail,
        has_existing_tax_code: hideIndividualId && kind === "individual",
      }),
    [kind, name, phone, email, contactName, taxCode, wantsVat, invoiceEmail, hideIndividualId],
  );
  const warnings = customerWarnings({
    customer_type: kind,
    name,
    phone,
    email,
    contact_name: contactName,
    tax_code: taxCode,
    wants_vat: wantsVat,
    invoice_email: invoiceEmail,
  });
  const errorCount = Object.keys(errors).length;
  const shown = (field: string) => (showAll || touched[field] ? errors[field] : undefined);
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const checkDup = (field: "phone" | "tax_code", value: string) => {
    touch(field);
    if (!value.trim() || errors[field]) return;
    void findDuplicateCustomer(field, value, customer?.id).then((hit) => {
      setDup((d) => (hit ? { field, ...hit } : d?.field === field ? null : d));
    });
  };

  function handleSubmit(formData: FormData) {
    setShowAll(true);
    setServerError(null);
    if (errorCount) return;
    startTransition(async () => {
      const result = customer
        ? await updateCustomer(customer.id, undefined, formData)
        : await createCustomer(undefined, formData);
      if (result && "error" in result) {
        setServerError(result.error);
        return;
      }
      onDone({ id: (result && "id" in result && result.id) || customer?.id || "", name });
    });
  }

  const field = (
    id: string,
    label: React.ReactNode,
    input: React.ReactNode,
    extra?: React.ReactNode,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {shown(id) ? (
        <p className="text-xs text-destructive">{shown(id)}</p>
      ) : (showAll || touched[id]) && warnings[id] ? (
        <p className="text-xs text-amber-600">{warnings[id]}</p>
      ) : (
        extra
      )}
    </div>
  );
  const invalid = (id: string) => (shown(id) ? "border-destructive aria-invalid:border-destructive" : undefined);
  const company = kind === "company";

  return (
    <form action={handleSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="customer_type" value={kind} />

      <div className="space-y-1.5">
        <Label>
          Loại khách <Req />
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "company", label: "Công ty", icon: Building2 },
              { value: "individual", label: "Cá nhân", icon: User },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={kind === o.value}
              onClick={() => setKind(o.value)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition",
                kind === o.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <o.icon className="size-4" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {field(
        "name",
        <>
          {company ? "Tên công ty" : "Họ tên"} <Req />
        </>,
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => touch("name")}
          className={invalid("name")}
        />,
      )}

      {company &&
        field(
          "contact_name",
          "Người liên hệ",
          <Input
            id="contact_name"
            name="contact_name"
            placeholder="Họ tên người liên hệ"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={() => touch("contact_name")}
            className={invalid("contact_name")}
          />,
        )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "phone",
          <>
            Số điện thoại {!company && <Req />}
          </>,
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            placeholder="0912345678 · nước ngoài: +62…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => checkDup("phone", phone)}
            className={invalid("phone")}
          />,
        )}
        {field(
          "email",
          "Email",
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => touch("email")}
            className={invalid("email")}
          />,
        )}
      </div>

      {company ? (
        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="wants_vat"
              checked={wantsVat}
              onChange={(e) => setWantsVat(e.target.checked)}
              className="size-4"
            />
            Khách lấy hoá đơn VAT
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              "tax_code",
              <>
                Mã số thuế (MST) {wantsVat && <Req />}
              </>,
              <Input
                id="tax_code"
                name="tax_code"
                inputMode="numeric"
                placeholder="0312345678"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                onBlur={() => checkDup("tax_code", taxCode)}
                className={invalid("tax_code")}
              />,
            )}
            {field(
              "invoice_email",
              <>
                Email nhận hoá đơn {wantsVat && <Req />}
              </>,
              <Input
                id="invoice_email"
                name="invoice_email"
                type="email"
                value={invoiceEmail}
                onChange={(e) => setInvoiceEmail(e.target.value)}
                onBlur={() => touch("invoice_email")}
                className={invalid("invoice_email")}
              />,
            )}
          </div>
        </div>
      ) : (
        field(
          "tax_code",
          <>
            Số CCCD / hộ chiếu <span className="font-normal text-muted-foreground">(= MST cá nhân, không bắt buộc)</span>
          </>,
          <Input
            id="tax_code"
            name="tax_code"
            autoCapitalize="characters"
            maxLength={20}
            placeholder={
              hideIndividualId ? `Đã có: ${maskIdNumber(customer?.tax_code)} — để trống giữ nguyên` : "12 chữ số"
            }
            value={taxCode}
            onChange={(e) => setTaxCode(e.target.value)}
            onBlur={() => checkDup("tax_code", taxCode)}
            className={invalid("tax_code")}
          />,
          cccdProvinceWarning(taxCode) && (
            <p className="text-xs text-amber-600">{cccdProvinceWarning(taxCode)}</p>
          ),
        )
      )}

      {dup && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Đã có khách trùng: <b>{dup.name}</b> ·{" "}
          <a href={`/customers/${dup.id}`} target="_blank" rel="noopener" className="font-semibold underline">
            Mở khách này
          </a>{" "}
          ·{" "}
          <button type="button" className="font-semibold underline" onClick={() => setDup(null)}>
            Vẫn tạo mới
          </button>
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="address">Địa chỉ</Label>
        <Input id="address" name="address" placeholder="Địa chỉ giao mặc định / xuất hoá đơn" defaultValue={customer?.address ?? ""} />
      </div>

      {company && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="representative_name">Người đại diện (ký hợp đồng)</Label>
            <Input id="representative_name" name="representative_name" placeholder="Ông/Bà ..." defaultValue={customer?.representative_name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="representative_title">Chức vụ</Label>
            <Input id="representative_title" name="representative_title" placeholder="Giám đốc..." defaultValue={customer?.representative_title ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget_unit_code">Mã số ĐVQHNS</Label>
            <Input id="budget_unit_code" name="budget_unit_code" placeholder="Không bắt buộc" defaultValue={customer?.budget_unit_code ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_number">Số tài khoản</Label>
            <Input id="bank_account_number" name="bank_account_number" inputMode="numeric" defaultValue={customer?.bank_account_number ?? ""} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bank_name">Tại ngân hàng</Label>
            <Input id="bank_name" name="bank_name" placeholder="Vietcombank - CN Hà Nội..." defaultValue={customer?.bank_name ?? ""} />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deposit_percentage">Tiền cọc</Label>
          <select
            id="deposit_percentage"
            name="deposit_percentage"
            defaultValue={String(customer?.deposit_percentage ?? 100)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="100">100% (mặc định)</option>
            <option value="50">50%</option>
            <option value="0">0% — khách thân thiết, miễn cọc</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Ghi chú</Label>
          <Input id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
        </div>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <DialogFooter className="items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onClose}>
          Đóng
        </Button>
        <div className="flex items-center gap-3">
          {showAll && errorCount > 0 && <span className="text-xs text-destructive">Còn {errorCount} lỗi cần sửa</span>}
          <Button type="submit" disabled={pending || (showAll && errorCount > 0)}>
            {pending ? "Đang lưu..." : "Lưu khách"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
