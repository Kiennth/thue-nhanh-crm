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
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  buildCompanyFirstOrderMap,
  buildCustomerReportRows,
  buildNewCustomersByMonth,
  buildReturningRateByMonth,
  daysSince,
  DORMANT_DAYS,
  DORMANT_MIN_ORDERS,
  findDormantCustomers,
  type CustomerReportRow,
} from "@/lib/customer-reports";
import { NewCustomersChart } from "./new-customers-chart";
import { ReturningRateChart } from "./returning-rate-chart";
import type { CustomerType } from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" });

// Số khách hiện trong danh sách gọi lại — đủ cho một buổi gọi, phần còn lại
// nằm ở con số tổng ngay dưới tiêu đề.
const DORMANT_LIST_SIZE = 10;

// Bao nhiêu tháng hiển thị trên biểu đồ khách mới — 12 tháng để so được
// cùng kỳ năm trước mà nhãn trục vẫn chưa chồng nhau.
const NEW_CUSTOMER_MONTHS = 12;

// Chi nhánh tháng này có kéo thêm được khách mới không — con số duy nhất
// trong khối báo cáo nói về TĂNG TRƯỞNG, mấy ô còn lại chỉ đếm tồn tại.
function NewCustomersCard({
  rows,
  companyFirstOrder,
}: {
  rows: CustomerReportRow[];
  companyFirstOrder: Map<string, string>;
}) {
  const points = buildNewCustomersByMonth(rows, NEW_CUSTOMER_MONTHS, companyFirstOrder);
  const thisMonth = points[points.length - 1]?.count ?? 0;
  const lastMonth = points[points.length - 2]?.count ?? 0;
  const delta = thisMonth - lastMonth;
  // Trung bình các tháng TRƯỚC tháng đang chạy — tháng hiện tại còn dở nên
  // đưa vào trung bình sẽ tự kéo mốc so sánh xuống.
  const past = points.slice(0, -1);
  const average = past.length ? past.reduce((s, p) => s + p.count, 0) / past.length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Khách mới theo tháng</CardTitle>
        <p className="text-sm text-muted-foreground">
          Khách lần đầu thuê của công ty — tháng hiện tại tính tới hôm nay.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-2xl font-semibold tabular-nums">{thisMonth}</p>
          <p className="text-sm text-muted-foreground">khách mới tháng này</p>
          {lastMonth > 0 && (
            <p
              className={`flex items-center gap-1 text-xs ${
                delta >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {delta >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {delta >= 0 ? "+" : ""}
              {delta} so với tháng trước
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Trung bình {average.toFixed(0)} khách/tháng trong {past.length} tháng trước
          </p>
        </div>

        <NewCustomersChart points={points} />
      </CardContent>
    </Card>
  );
}

// Cùng cặp với thẻ khách mới: một bên đo kéo được người lạ vào, bên này đo
// giữ được người cũ ở lại. Tỉ lệ theo TỪNG THÁNG nên nhúc nhích thật, khác
// ô "Khách quay lại (2+ đơn)" cộng dồn từ đầu gần như đứng yên.
function ReturningRateCard({
  orders,
  companyFirstOrder,
}: {
  orders: { customer_id: string; order_date: string; cancelled_at: string | null }[];
  companyFirstOrder: Map<string, string>;
}) {
  const points = buildReturningRateByMonth(orders, NEW_CUSTOMER_MONTHS, companyFirstOrder);
  const current = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta =
    current?.rate != null && previous?.rate != null ? current.rate - previous.rate : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tỉ lệ khách quay lại theo tháng</CardTitle>
        <p className="text-sm text-muted-foreground">
          Trong số khách có thuê trong tháng, bao nhiêu phần trăm đã từng thuê trước đó.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {current?.rate != null ? `${current.rate.toFixed(0)}%` : "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {current ? `${current.returningCount}/${current.activeCount} khách tháng này` : ""}
          </p>
          {delta !== null && (
            <p
              className={`flex items-center gap-1 text-xs ${
                delta >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {delta >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(0)} điểm so với tháng trước
            </p>
          )}
        </div>

        <ReturningRateChart points={points} />
      </CardContent>
    </Card>
  );
}

// Danh sách việc cần làm, không phải báo cáo: khách từng thuê nhiều lần mà
// lâu rồi im ắng, kèm số điện thoại để gọi được ngay mà không phải mở từng
// hồ sơ.
function DormantCustomersCard({ rows }: { rows: CustomerReportRow[] }) {
  const dormant = findDormantCustomers(rows);
  const shown = dormant.slice(0, DORMANT_LIST_SIZE);
  const lostRevenue = dormant.reduce((sum, r) => sum + r.totalRevenue, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Khách nguội cần gọi lại</CardTitle>
        <p className="text-sm text-muted-foreground">
          Từng thuê {DORMANT_MIN_ORDERS}+ lần nhưng đã hơn {DORMANT_DAYS} ngày không quay lại
          {dormant.length > 0 && (
            <>
              {" "}
              — <span className="font-medium text-foreground">{dormant.length} khách</span>, từng
              mang về {currencyFormatter.format(lostRevenue)}đ
            </>
          )}
          .
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead className="text-right">Số đơn</TableHead>
              <TableHead className="text-right">Đã chi</TableHead>
              <TableHead className="text-right">Lần cuối</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.phone ? (
                    <a href={`tel:${r.phone}`} className="hover:underline">
                      {r.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {currencyFormatter.format(r.totalRevenue)}đ
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {dateFormatter.format(new Date(r.lastOrderDate!))}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({daysSince(r.lastOrderDate!)} ngày)
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {!shown.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Không có khách nào bỏ lâu — mọi khách quen đều đã quay lại gần đây.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {dormant.length > shown.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Đang hiện {shown.length} khách chi nhiều nhất trong tổng số {dormant.length}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

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
      {/* Không đặt tên "Khách mới": đây là khách CHƯA TỪNG quay lại tính từ
          đầu đến giờ, khác hẳn "khách mới trong tháng" ở thẻ xu hướng. */}
      <StatCard label="Khách chưa quay lại (1 đơn)" value={newCount} />
      <StatCard label="Khách quay lại (2+ đơn)" value={returningCount}>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {((returningCount / rows.length) * 100).toFixed(0)}% tổng số khách
          </p>
        )}
      </StatCard>
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
  companyFirstOrder: companyFirstOrderProp,
  showRankings = true,
}: {
  // Xếp hạng khách theo doanh số, công nợ và danh sách khách nguội là việc
  // của Giám đốc/Admin/Kế toán — CEO chốt Cửa hàng trưởng không cần nhìn,
  // bạn ấy chỉ cần số lượng/cơ cấu và tăng trưởng khách của chi nhánh mình.
  showRankings?: boolean;
  customers: { id: string; name: string; customer_type: CustomerType }[];
  orders: {
    id: string;
    customer_id: string;
    total_value: number;
    order_date: string;
    cancelled_at: string | null;
  }[];
  payments: { order_id: string; amount: number }[];
  // Ngày thuê đầu tiên của từng khách trên TOÀN CÔNG TY. Người xem toàn hệ
  // thống thì suy ra được từ chính `orders`; người bị RLS giới hạn theo chi
  // nhánh phải được trang truyền vào (xem fetchCompanyFirstOrderDates).
  companyFirstOrder?: Map<string, string>;
}) {
  const rows = buildCustomerReportRows(customers, orders, payments);
  const companyFirstOrder = companyFirstOrderProp ?? buildCompanyFirstOrderMap(orders);

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewCustomersCard rows={rows} companyFirstOrder={companyFirstOrder} />
        <ReturningRateCard orders={orders} companyFirstOrder={companyFirstOrder} />
      </div>

      {/* Khách nguội nằm cùng nhóm quyền với xếp hạng doanh số: CEO chốt tạm
          thời chỉ Giám đốc/Admin/Kế toán xem, chưa mở cho Cửa hàng trưởng. */}
      {showRankings && <DormantCustomersCard rows={rows} />}

      {showRankings && (
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
      )}
    </div>
  );
}
