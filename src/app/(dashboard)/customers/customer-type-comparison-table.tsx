import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export interface CustomerTypeStat {
  customerCount: number;
  orderCount: number;
  revenue: number;
}

// Bảng tương quan Khách cá nhân/Khách công ty — CEO yêu cầu 2026-08-06 để
// ra quyết định và báo cáo cổ đông/nhà đầu tư. Dùng chung kỳ với khối
// "Tổng quan theo kỳ" ngay phía trên (CustomerOverviewPeriodToggle điều
// khiển cả hai, không có toggle riêng) — data đã tính sẵn trong Postgres
// qua RPC customer_page_report (field periodByCustomerType).
export function CustomerTypeComparisonTable({
  individual,
  company,
}: {
  individual: CustomerTypeStat;
  company: CustomerTypeStat;
}) {
  const totalRevenue = individual.revenue + company.revenue;
  const share = (v: number) => (totalRevenue > 0 ? (v / totalRevenue) * 100 : 0);
  const perCustomer = (v: number, count: number) => (count > 0 ? v / count : 0);
  const perOrder = (v: number, count: number) => (count > 0 ? v / count : 0);

  const rows: {
    label: string;
    individual: string;
    company: string;
  }[] = [
    {
      label: "Số khách hoạt động",
      individual: numberFormatter.format(individual.customerCount),
      company: numberFormatter.format(company.customerCount),
    },
    {
      label: "Số đơn hàng",
      individual: numberFormatter.format(individual.orderCount),
      company: numberFormatter.format(company.orderCount),
    },
    {
      label: "Doanh thu",
      individual: `${currencyFormatter.format(individual.revenue)}đ`,
      company: `${currencyFormatter.format(company.revenue)}đ`,
    },
    {
      label: "Tỉ trọng đóng góp doanh thu",
      individual: `${share(individual.revenue).toFixed(0)}%`,
      company: `${share(company.revenue).toFixed(0)}%`,
    },
    {
      label: "Doanh thu TB / khách",
      individual: `${currencyFormatter.format(perCustomer(individual.revenue, individual.customerCount))}đ`,
      company: `${currencyFormatter.format(perCustomer(company.revenue, company.customerCount))}đ`,
    },
    {
      label: "Doanh thu TB / đơn",
      individual: `${currencyFormatter.format(perOrder(individual.revenue, individual.orderCount))}đ`,
      company: `${currencyFormatter.format(perOrder(company.revenue, company.orderCount))}đ`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tương quan Khách cá nhân / Khách công ty</CardTitle>
        <p className="text-sm text-muted-foreground">
          Theo đúng kỳ đang chọn ở trên — dùng để ra quyết định hoặc báo cáo cổ đông, nhà đầu tư.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chỉ số</TableHead>
              <TableHead className="text-right">Khách cá nhân</TableHead>
              <TableHead className="text-right">Khách công ty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="text-muted-foreground">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{r.individual}</TableCell>
                <TableCell className="text-right tabular-nums">{r.company}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
