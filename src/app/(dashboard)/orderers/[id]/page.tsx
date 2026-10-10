import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/dal";
import { ORDERER_VIEW_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ORDER_FLOW_LABELS, orderFlowStage, TASK_TYPE_LABELS, VAT_RATE } from "@/lib/order-labels";
import { OrdererDialog, type OrdererRow } from "../orderer-dialog";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  total_value: number;
  status: keyof typeof TASK_TYPE_LABELS;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  customers: { id: string; name: string } | null;
};

export default async function OrdererDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...ORDERER_VIEW_ROLES]);
  const { id } = await params;
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: orderer }, { data: orders }] = await Promise.all([
    db.from("orderers").select("id, name, phone, email, title, notes, created_at").eq("id", id).maybeSingle(),
    db
      .from("orders")
      .select("id, order_code, order_date, total_value, status, delivered_at, completed_at, cancelled_at, customers(id, name)")
      .eq("orderer_id", id)
      .order("order_date", { ascending: false })
      .limit(500),
  ]);
  if (!orderer) notFound();
  const list = (orders ?? []) as unknown as OrderRow[];
  const live = list.filter((o) => !o.cancelled_at);
  const revenue = live
    .filter((o) => o.delivered_at)
    .reduce((s, o) => s + Math.round(Number(o.total_value) * (1 + VAT_RATE) * 100) / 100, 0);

  // Công ty đã đặt hộ: số đơn + lần gần nhất — thấy được họ đã chuyển chỗ làm.
  const companies = new Map<string, { id: string; name: string; count: number; last: string }>();
  for (const o of live) {
    if (!o.customers) continue;
    const c = companies.get(o.customers.id) ?? { id: o.customers.id, name: o.customers.name, count: 0, last: o.order_date };
    c.count += 1;
    if (o.order_date > c.last) c.last = o.order_date;
    companies.set(o.customers.id, c);
  }
  const companyList = [...companies.values()].sort((a, b) => b.last.localeCompare(a.last));
  const dmy = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orderers" className="text-sm text-muted-foreground hover:underline">
            ← Người đặt hàng
          </Link>
          <h1 className="text-2xl font-semibold">{orderer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[orderer.phone, orderer.email, orderer.title].filter(Boolean).join(" · ") || "Chưa có thông tin liên hệ"}
          </p>
        </div>
        <OrdererDialog orderer={orderer as OrdererRow} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Số đơn", String(live.length)],
          ["Doanh số mang về (đã giao)", `${vnd.format(revenue)}đ`],
          ["Số công ty đã đặt", String(companyList.length)],
          ["Lần đặt gần nhất", live[0] ? dmy(live[0].order_date) : "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {orderer.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ghi chú chăm sóc</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{orderer.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đã đặt cho các công ty</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {companyList.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:border-primary">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground"> · {c.count} đơn · gần nhất {dmy(c.last)}</span>
            </Link>
          ))}
          {!companyList.length && <p className="text-sm text-muted-foreground">Chưa có.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đơn đã đặt ({list.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead className="text-right">Tổng (gồm VAT)</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      {o.order_code}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{dmy(o.order_date)}</TableCell>
                  <TableCell>{o.customers?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vnd.format(Math.round(Number(o.total_value) * (1 + VAT_RATE)))}đ
                  </TableCell>
                  <TableCell>
                    {o.cancelled_at ? (
                      <Badge variant="destructive">Đã huỷ</Badge>
                    ) : o.completed_at ? (
                      <Badge>Hoàn tất</Badge>
                    ) : (
                      <Badge variant="outline">{ORDER_FLOW_LABELS[orderFlowStage(o.status)]}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
