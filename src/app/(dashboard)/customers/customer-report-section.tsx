import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">Tổng khách hàng</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{rows.length}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">Cá nhân / Doanh nghiệp</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {individualCount} / {companyCount}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">Khách mới (1 đơn)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{newCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">Khách quay lại (2+ đơn)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{returningCount}</p>
        </CardContent>
      </Card>
    </div>
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

  const topByRevenue = [...rows]
    .filter((r) => r.totalRevenue > 0)
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top khách hàng theo doanh số</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Doanh số</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topByRevenue.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${r.id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>{currencyFormatter.format(r.totalRevenue)}đ</TableCell>
                  </TableRow>
                ))}
                {!topByRevenue.length && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Chưa có doanh số nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Công nợ theo khách hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
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
                    <TableCell className="text-destructive">
                      {currencyFormatter.format(r.totalOwed)}đ
                    </TableCell>
                  </TableRow>
                ))}
                {!debtRows.length && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
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
