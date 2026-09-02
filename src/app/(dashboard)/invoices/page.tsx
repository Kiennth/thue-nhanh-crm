import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { VAT_RATE } from "@/lib/order-labels";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { InvoiceRowActions } from "./row-actions";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: VN_TIME_ZONE });

const FILTERS = [
  { key: "pending", label: "Chờ xuất" },
  { key: "issued", label: "Đã xuất" },
  { key: "not_needed", label: "Không cần" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// Sổ hoá đơn đỏ (CEO 2026-09-02): đơn HOÀN TẤT đủ 10 khâu tự vào "Chờ xuất"
// — kế toán xuất hoá đơn xong bấm xác nhận (lưu số HĐ + ngày), khách lẻ
// không lấy hoá đơn thì bấm "Không cần". Đơn hoàn tất trước 09/2026 đã xử
// lý bên Booqable nên backfill sẵn "không cần" (migration 20260902120000).
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole([...MANAGE_ROLES]);
  const { filter } = await searchParams;
  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filter)
    ? (filter as FilterKey)
    : "pending";

  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, order_code, total_value, completed_at, invoice_issued_at, invoice_number, customers(id, name, customer_type, tax_code, email)",
    )
    .not("completed_at", "is", null)
    .is("cancelled_at", null)
    .order("completed_at", { ascending: false })
    .limit(200);
  if (activeFilter === "pending")
    query = query.is("invoice_issued_at", null).eq("invoice_not_needed", false);
  if (activeFilter === "issued") query = query.not("invoice_issued_at", "is", null);
  if (activeFilter === "not_needed")
    query = query.eq("invoice_not_needed", true).is("invoice_issued_at", null);

  const [{ data: orders }, pendingRes, issuedRes] = await Promise.all([
    query,
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("completed_at", "is", null)
      .is("cancelled_at", null)
      .is("invoice_issued_at", null)
      .eq("invoice_not_needed", false),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("invoice_issued_at", "is", null),
  ]);

  const rows = orders ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Hoá đơn đỏ</h1>
        <p className="text-sm text-muted-foreground">
          Đơn hoàn tất đủ 10 khâu tự vào danh sách chờ xuất.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Chờ xuất hoá đơn" value={pendingRes.count ?? 0} />
        <StatCard label="Đã xuất" value={issuedRes.count ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "pending" ? "/invoices" : `/invoices?filter=${f.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              activeFilter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Đơn</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>MST</TableHead>
            <TableHead className="text-right">Chưa VAT</TableHead>
            <TableHead className="text-right">VAT ({VAT_RATE * 100}%)</TableHead>
            <TableHead className="text-right">Tổng</TableHead>
            <TableHead>Hoàn tất</TableHead>
            {activeFilter === "issued" && <TableHead>Số HĐ / Ngày xuất</TableHead>}
            <TableHead className="w-48"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => {
            const customer = o.customers as unknown as {
              id: string;
              name: string;
              customer_type: string;
              tax_code: string | null;
              email: string | null;
            } | null;
            const vat = Math.round(o.total_value * VAT_RATE * 100) / 100;
            return (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
                    {o.order_code}
                  </Link>
                </TableCell>
                <TableCell>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {customer?.email && (
                    <p className="text-xs text-muted-foreground">{customer.email}</p>
                  )}
                </TableCell>
                <TableCell>
                  {customer?.tax_code ? (
                    <span className="tabular-nums">{customer.tax_code}</span>
                  ) : customer?.customer_type === "company" ? (
                    // Công ty mà thiếu MST là xuất không nổi — cảnh báo đỏ,
                    // bấm tên khách bên cạnh để bổ sung.
                    <Badge variant="destructive">
                      <AlertTriangle className="size-3" />
                      Thiếu MST
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currencyFormatter.format(o.total_value)}đ
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currencyFormatter.format(vat)}đ
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currencyFormatter.format(o.total_value + vat)}đ
                </TableCell>
                <TableCell className="text-sm">
                  {o.completed_at ? dateFormatter.format(new Date(o.completed_at)) : "—"}
                </TableCell>
                {activeFilter === "issued" && (
                  <TableCell className="text-sm">
                    {o.invoice_number ?? "—"}
                    {o.invoice_issued_at && (
                      <p className="text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(o.invoice_issued_at))}
                      </p>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <InvoiceRowActions
                    orderId={o.id}
                    state={
                      o.invoice_issued_at ? "issued" : activeFilter === "not_needed" ? "not_needed" : "pending"
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {activeFilter === "pending"
                  ? "Không còn đơn nào chờ xuất hoá đơn. 🎉"
                  : "Chưa có đơn nào."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
