import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { DebtNoteDialog, type DebtNoteRow } from "./debt-note-dialog";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

// Sổ đòi nợ theo tuổi nợ (CEO chọn làm 2026-08-09) — nợ càng già càng khó
// đòi: 4 bucket theo order_date của từng đơn còn thiếu, khách nợ già nằm
// trên cùng. Quy tắc công nợ toàn hệ thống: mọi đơn chưa huỷ (kể cả đã
// hoàn tất), nền giá gồm VAT. Kèm nhật ký đòi nợ per khách.
export default async function DebtsPage() {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const [{ data: report, error }, { data: notes }, { data: employees }] = await Promise.all([
    supabase.rpc("debt_aging_report"),
    supabase
      .from("debt_notes")
      .select("id, customer_id, note, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("employees").select("id, name"),
  ]);
  if (error || !report || "error" in report) {
    throw new Error("Không tải được báo cáo công nợ: " + (error?.message ?? "forbidden"));
  }

  const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.name]));
  const notesByCustomer = new Map<string, DebtNoteRow[]>();
  for (const n of notes ?? []) {
    const list = notesByCustomer.get(n.customer_id) ?? [];
    list.push({
      id: n.id,
      note: n.note,
      created_at: n.created_at,
      authorName: n.created_by ? (employeeNameById.get(n.created_by) ?? null) : null,
    });
    notesByCustomer.set(n.customer_id, list);
  }

  // rows đã sắp sẵn trong SQL: nợ già nhất lên đầu (300 khách); totals cộng
  // trên TOÀN BỘ khách còn nợ, không chỉ 300 dòng hiển thị.
  const debtRows = report.rows;
  const totals = {
    all: report.totals.totalOwed,
    b0: report.totals.bucket0_30,
    b31: report.totals.bucket31_60,
    b61: report.totals.bucket61_90,
    b90: report.totals.bucket90Plus,
    customerCount: report.totals.customerCount,
  };

  const bucketCards = [
    { label: "Dưới 30 ngày", value: totals.b0, tone: "" },
    { label: "31–60 ngày", value: totals.b31, tone: "text-amber-600" },
    { label: "61–90 ngày", value: totals.b61, tone: "text-orange-600" },
    { label: "Trên 90 ngày", value: totals.b90, tone: "text-destructive" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Công nợ</h1>
        <p className="text-sm text-muted-foreground">
          Nợ càng già càng khó đòi — khách nợ lâu nhất nằm trên cùng, ghi chú lại mỗi lần gọi để
          không ai phải hỏi lại từ đầu.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng phải thu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{currencyFormatter.format(totals.all)}đ</p>
            <p className="text-xs text-muted-foreground">
              {totals.customerCount} khách còn nợ
              {totals.customerCount > debtRows.length &&
                ` — bảng hiện ${debtRows.length} khách nợ già nhất`}
            </p>
          </CardContent>
        </Card>
        {bucketCards.map((b) => (
          <Card key={b.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{b.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold ${b.tone}`}>
                {currencyFormatter.format(b.value)}đ
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Khách hàng</TableHead>
            <TableHead className="text-right">Dưới 30 ngày</TableHead>
            <TableHead className="text-right">31–60</TableHead>
            <TableHead className="text-right">61–90</TableHead>
            <TableHead className="text-right">Trên 90</TableHead>
            <TableHead className="text-right">Tổng nợ</TableHead>
            <TableHead>Nợ già nhất</TableHead>
            <TableHead>Lần gọi gần nhất</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {debtRows.map((r) => {
            const customerNotes = notesByCustomer.get(r.customer_id) ?? [];
            const latestNote = customerNotes[0];
            return (
              <TableRow key={r.customer_id}>
                <TableCell className="max-w-64">
                  <Link
                    href={`/customers/${r.customer_id}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {r.customer_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.unpaid_order_count} đơn chưa trả đủ
                    {r.phone ? ` · ${r.phone}` : ""}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  {r.bucket_0_30 > 0 ? `${currencyFormatter.format(r.bucket_0_30)}đ` : "—"}
                </TableCell>
                <TableCell className="text-right text-amber-600">
                  {r.bucket_31_60 > 0 ? `${currencyFormatter.format(r.bucket_31_60)}đ` : "—"}
                </TableCell>
                <TableCell className="text-right text-orange-600">
                  {r.bucket_61_90 > 0 ? `${currencyFormatter.format(r.bucket_61_90)}đ` : "—"}
                </TableCell>
                <TableCell className="text-right text-destructive">
                  {r.bucket_90_plus > 0 ? `${currencyFormatter.format(r.bucket_90_plus)}đ` : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {currencyFormatter.format(r.total_owed)}đ
                </TableCell>
                <TableCell>
                  <Badge variant={r.oldest_debt_days > 90 ? "destructive" : "outline"}>
                    {r.oldest_debt_days} ngày
                  </Badge>
                </TableCell>
                <TableCell className="max-w-56">
                  {latestNote ? (
                    <p className="truncate text-sm" title={latestNote.note}>
                      {latestNote.note}
                    </p>
                  ) : (
                    <span className="text-sm text-muted-foreground">Chưa ghi chú</span>
                  )}
                </TableCell>
                <TableCell>
                  <DebtNoteDialog
                    customerId={r.customer_id}
                    customerName={r.customer_name}
                    notes={customerNotes}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {!debtRows.length && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                Không có khách nào còn nợ. 🎉
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
