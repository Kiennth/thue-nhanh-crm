import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { parseTransferContent } from "@/lib/vietqr";
import { BankRowActions } from "./row-actions";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VN_TIME_ZONE,
});

type Tx = {
  id: string;
  amount: number;
  content: string | null;
  bank: string | null;
  account_number: string | null;
  transaction_at: string;
  status: "matched" | "unmatched" | "ignored";
  order_id: string | null;
  orders: { order_code: string } | null;
};

const STATUS: Record<Tx["status"], { label: string; cls: string }> = {
  matched: { label: "Đã ghi vào đơn", cls: "bg-emerald-500/15 text-emerald-700" },
  unmatched: { label: "Chưa khớp đơn", cls: "bg-amber-500/15 text-amber-700" },
  ignored: { label: "Bỏ qua", cls: "bg-muted text-muted-foreground" },
};

// Tiền vào tài khoản công ty (SePay báo về) — giao dịch có mã đơn trong nội
// dung tự ghi vào đơn; còn lại nằm đây chờ gán tay (CEO 2026-10-04).
export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireRole([...MANAGE_ROLES]);
  const { show } = await searchParams;
  const showAll = show === "all";
  const db = (await createClient()) as unknown as SupabaseClient;
  let q = db
    .from("bank_transactions")
    .select("id, amount, content, bank, account_number, transaction_at, status, order_id, orders(order_code)")
    .order("transaction_at", { ascending: false })
    .limit(200);
  if (!showAll) q = q.eq("status", "unmatched");
  const [{ data }, { count: unmatchedCount }, { count: totalCount }] = await Promise.all([
    q,
    db.from("bank_transactions").select("id", { count: "exact", head: true }).eq("status", "unmatched"),
    db.from("bank_transactions").select("id", { count: "exact", head: true }),
  ]);
  const rows = (data ?? []) as unknown as Tx[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/debts" className="text-sm text-muted-foreground hover:underline">
            ← Công nợ
          </Link>
          <h1 className="text-2xl font-semibold">Tiền vào ngân hàng</h1>
          <p className="text-sm text-muted-foreground">
            Khách quét QR trên báo giá/đơn là tiền tự ghi vào đúng đơn. Giao dịch không đọc được mã đơn nằm ở
            đây — gõ mã đơn để ghi, hoặc bấm Bỏ qua nếu không phải tiền đơn hàng.
          </p>
        </div>
        <div className="inline-flex rounded-lg border p-1 text-sm">
          <Link
            href="/debts/bank"
            className={`rounded-md px-3 py-1.5 ${!showAll ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Chưa khớp ({unmatchedCount ?? 0})
          </Link>
          <Link
            href="/debts/bank?show=all"
            className={`rounded-md px-3 py-1.5 ${showAll ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Tất cả ({totalCount ?? 0})
          </Link>
        </div>
      </div>

      {(totalCount ?? 0) === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chưa nhận giao dịch nào</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Cần nối tài khoản ngân hàng nhận tiền (in trên chứng từ) với SePay (sepay.vn) rồi tạo webhook trỏ về:</p>
            <p className="font-mono text-foreground">https://crm.thuenhanh.vn/api/bank/sepay</p>
            <p>Kiểu xác thực “API Key” — khoá lấy từ quản trị CRM (biến SEPAY_WEBHOOK_KEY).</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Thời gian</TableHead>
              <TableHead className="w-32 text-right">Số tiền</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="w-36">Trạng thái</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm tabular-nums">{timeFmt.format(new Date(t.transaction_at))}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{vnd.format(Number(t.amount))}đ</TableCell>
                <TableCell className="max-w-md text-sm">
                  <p className="break-words">{t.content || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.bank ?? ""} {t.account_number ?? ""}
                  </p>
                </TableCell>
                <TableCell>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[t.status].cls}`}>
                    {STATUS[t.status].label}
                  </span>
                  {t.order_id && t.orders && (
                    <Link href={`/orders/${t.order_id}`} className="ml-2 text-sm font-medium hover:underline">
                      {t.orders.order_code}
                    </Link>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {t.status !== "matched" && (
                    <BankRowActions
                      transactionId={t.id}
                      status={t.status}
                      suggestedCode={t.content ? (parseTransferContent(t.content)?.orderCode ?? null) : null}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length === 0 && (totalCount ?? 0) > 0 && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Không còn giao dịch nào chưa khớp 🎉
        </p>
      )}
    </div>
  );
}
