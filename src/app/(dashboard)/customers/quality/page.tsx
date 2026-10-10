import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { maskIdNumber } from "@/lib/customer-validation";
import { QualityList, DuplicateGroups, type QualityCustomer } from "./quality-lists";

// Dữ liệu khách cần sửa (Grok tách gọn CRM 10/10, giai đoạn 6): mỗi loại lỗi
// 1 danh sách, khách có đơn gần đây lên đầu, bấm Sửa ngay tại chỗ — sửa xong
// khách tự rơi khỏi danh sách. Trùng SĐT / MST: chọn khách giữ lại rồi Gộp
// (chuyển hết đơn sang, xoá bản trùng).
const KINDS = [
  { key: "no_tax", label: "Công ty thiếu MST", hint: "Khách Công ty chưa có mã số thuế." },
  { key: "no_invoice_email", label: "Thiếu email nhận HĐ", hint: "Khách lấy VAT nhưng chưa có email nhận hoá đơn." },
  { key: "no_address", label: "Thiếu địa chỉ", hint: "Khách lấy VAT nhưng chưa có địa chỉ (bắt buộc trên hoá đơn)." },
  { key: "bad_phone", label: "SĐT sai mẫu", hint: "SĐT không đủ 10 số bắt đầu bằng 0." },
  {
    key: "dup_phone",
    label: "Trùng SĐT",
    hint: "Nhiều khách cùng 1 số điện thoại. Thường là CÙNG NGƯỜI LIÊN HỆ của nhiều công ty khác nhau (không phải lỗi) — chỉ Gộp khi chắc chắn là cùng 1 khách (cùng tên / MST).",
  },
  {
    key: "dup_tax",
    label: "Trùng MST",
    hint: "Nhiều khách cùng 1 mã số thuế — thường là cùng 1 công ty tạo 2 lần. Chọn khách giữ lại rồi Gộp.",
  },
  { key: "needs_review", label: "Cần rà (dữ liệu cũ)", hint: "Ô MST / CCCD cũ không khớp mẫu khi tách Công ty / Cá nhân." },
] as const;
type Kind = (typeof KINDS)[number]["key"];

export default async function CustomerQualityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const employee = await requireRole(["giam_doc", "admin", "ke_toan", "cua_hang_truong"]);
  const { kind: kindParam } = await searchParams;
  const kind: Kind = KINDS.some((k) => k.key === kindParam) ? (kindParam as Kind) : "no_tax";
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase.rpc("customer_quality", { p_kind: kind, p_limit: 100 });
  const payload = (data ?? { counts: {}, rows: [] }) as {
    counts: Record<Kind, number>;
    rows: unknown[];
  };
  const active = KINDS.find((k) => k.key === kind)!;
  const canMerge = ["giam_doc", "admin", "ke_toan"].includes(employee.role);
  const canViewIdNumber = canMerge;
  const isDup = kind === "dup_phone" || kind === "dup_tax";
  // CCCD khách cá nhân che "1234xxxx" với vai trò không quản lý (CEO 09/10) —
  // che ở máy chủ, không gửi số đủ xuống trình duyệt.
  const mask = (c: QualityCustomer): QualityCustomer =>
    canViewIdNumber || c.customer_type !== "individual" ? c : { ...c, tax_code: maskIdNumber(c.tax_code) };
  const rows = isDup
    ? (payload.rows as { key: string; customers: QualityCustomer[] }[]).map((g) => ({
        key: kind === "dup_tax" && !canViewIdNumber ? (maskIdNumber(g.key) ?? g.key) : g.key,
        customers: g.customers.map(mask),
      }))
    : (payload.rows as QualityCustomer[]).map(mask);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dữ liệu khách cần sửa</h1>
        <p className="text-sm text-muted-foreground">
          Khách có đơn gần đây lên đầu, mỗi danh sách tối đa 100 dòng. Sửa xong khách tự rơi khỏi danh sách.
        </p>
      </div>
      <div className="-mx-1 flex max-w-full flex-wrap gap-1 px-1">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={k.key === "no_tax" ? "/customers/quality" : `/customers/quality?kind=${k.key}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              kind === k.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {k.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                kind === k.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
              )}
            >
              {payload.counts[k.key] ?? 0}
            </span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{active.hint}</p>
      {isDup ? (
        <DuplicateGroups
          kind={kind as "dup_phone" | "dup_tax"}
          groups={rows as { key: string; customers: QualityCustomer[] }[]}
          keyLabel={kind === "dup_phone" ? "SĐT" : "MST"}
          canMerge={canMerge}
          canViewIdNumber={canViewIdNumber}
        />
      ) : (
        <QualityList rows={rows as QualityCustomer[]} canViewIdNumber={canViewIdNumber} />
      )}
    </div>
  );
}
