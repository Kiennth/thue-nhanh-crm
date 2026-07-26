import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildCustomerReportRows, type CustomerReportRow } from "@/lib/customer-reports";
import type { CustomerType } from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// 4 thẻ tóm tắt — dùng chung cho báo cáo đầy đủ ở /customers và khối tóm tắt
// condensed trên Trang chủ.
export function CustomerOverviewTiles({ rows }: { rows: CustomerReportRow[] }) {
  const individualCount = rows.filter((r) => r.customerType === "individual").length;
  const companyCount = rows.filter((r) => r.customerType === "company").length;
  const newCount = rows.filter((r) => r.orderCount === 1).length;
  const returningCount = rows.filter((r) => r.orderCount > 1).length;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Tổng khách hàng" value={rows.length} />
      <StatCard label="Cá nhân / Doanh nghiệp" value={`${individualCount} / ${companyCount}`} />
      <StatCard label="Khách mới (1 đơn)" value={newCount} />
      <StatCard label="Khách quay lại (2+ đơn)" value={returningCount} />
    </div>
  );
}

function TopRevenueCard({ title, rows }: { title: string; rows: CustomerReportRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Số lượng đơn</TableHead>
              <TableHead>Doanh số</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>{r.orderCount}</TableCell>
                <TableCell>{currencyFormatter.format(r.totalRevenue)}đ</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Chưa có doanh số nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CustomerReportSection({
  customers,
  orders,
  payments,
}: {
  customers: { id: string; name: string; customer_type: CustomerType }[];
  orders: {
    id: string;
    customer_id: string;
    total_value: number;
    order_date: string;
    cancelled_at: string | null;
  }[];
  payments: { order_id: string; amount: number }[];
}) {
  const rows = buildCustomerReportRows(customers, orders, payments);

  const topCompanyByRevenue = [...rows]
    .filter((r) => r.customerType === "company" && r.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  const topIndividualByRevenue = [...rows]
    .filter((r) => r.customerType === "individual" && r.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  const debtRows = [...rows]
    .filter((r) => r.totalOwed > 0)
    .sort((a, b) => b.totalOwed - a.totalOwed)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Báo cáo khách hàng</h2>

      <CustomerOverviewTiles rows={rows} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopRevenueCard title="Top khách hàng công ty theo doanh số" rows={topCompanyByRevenue} />
        <TopRevenueCard title="Top khách hàng cá nhân theo doanh số" rows={topIndividualByRevenue} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Công nợ theo khách hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Số lượng đơn</TableHead>
                  <TableHead>Còn nợ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debtRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${r.id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>{r.orderCount}</TableCell>
                    <TableCell className="text-destructive">
                      {currencyFormatter.format(r.totalOwed)}đ
                    </TableCell>
                  </TableRow>
                ))}
                {!debtRows.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Không có khách nào còn nợ.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
