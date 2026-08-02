import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import {
  daysSince,
  DORMANT_DAYS,
  DORMANT_MIN_ORDERS,
  findDormantCustomers,
  type CustomerReportRow,
  type NewCustomerPoint,
} from "@/lib/customer-reports";
import { NewCustomersCard, ReturningRateCard } from "./customer-trend-cards";
import { VN_TIME_ZONE } from "@/lib/date-format";

// Payload đã tổng hợp sẵn từ RPC customer_page_report (Postgres tính, trả
// vài chục dòng) — thay cho việc kéo 21k dòng thô về rồi cộng trừ trong JS.
export interface CustomerReportData {
  stats: {
    totalCustomers: number;
    individualCount: number;
    companyCount: number;
    withOrders: number;
    returning2Plus: number;
  };
  monthlyNew: NewCustomerPoint[];
  returningRate: { month: string; activeCount: number; returningCount: number }[];
  topCompanies: { id: string; name: string; orderCount: number; totalRevenue: number }[];
  debt: { id: string; name: string; orderCount: number; totalOwed: number }[];
}
import { RevenueBarList } from "@/components/revenue-bar-list";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: VN_TIME_ZONE });

// Số khách hiện trong danh sách gọi lại — đủ cho một buổi gọi, phần còn lại
// nằm ở con số tổng ngay dưới tiêu đề.
const DORMANT_LIST_SIZE = 10;

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
        <ul className="divide-y">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <Link href={`/customers/${r.id}`} className="font-medium hover:underline">
                  <span className="line-clamp-1">{r.name}</span>
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.orderCount} đơn · đã chi {currencyFormatter.format(r.totalRevenue)}đ
                </p>
              </div>

              {/* Số ngày im ắng là thứ quyết định gọi ai trước — cho nó một
                  chip màu hổ phách để nổi lên khỏi hàng chữ xám. */}
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                style={{
                  backgroundColor: "color-mix(in oklab, var(--chart-4) 16%, transparent)",
                  color: "color-mix(in oklab, var(--chart-4) 75%, var(--foreground))",
                }}
                title={`Lần thuê gần nhất ${dateFormatter.format(new Date(r.lastOrderDate!))}`}
              >
                {daysSince(r.lastOrderDate!)} ngày
              </span>

              {r.phone ? (
                <a
                  href={`tel:${r.phone}`}
                  className="hidden shrink-0 text-xs text-muted-foreground tabular-nums hover:underline sm:inline"
                >
                  {r.phone}
                </a>
              ) : (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  chưa có SĐT
                </span>
              )}
            </li>
          ))}
          {!shown.length && (
            <li className="py-2 text-sm text-muted-foreground">
              Không có khách nào bỏ lâu — mọi khách quen đều đã quay lại gần đây.
            </li>
          )}
        </ul>
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
export function CustomerOverviewTiles({ stats }: { stats: CustomerReportData["stats"] }) {
  const individualCount = stats.individualCount;
  const companyCount = stats.companyCount;
  // "Chưa quay lại" = có đơn nhưng chỉ đúng 1 — suy từ 2 số đếm của RPC.
  const newCount = stats.withOrders - stats.returning2Plus;
  const returningCount = stats.returning2Plus;
  const rowsLength = stats.totalCustomers;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Tổng khách hàng" value={rowsLength} />
      <StatCard label="Cá nhân / Doanh nghiệp" value={`${individualCount} / ${companyCount}`} />
      {/* Không đặt tên "Khách mới": đây là khách CHƯA TỪNG quay lại tính từ
          đầu đến giờ, khác hẳn "khách mới trong tháng" ở thẻ xu hướng. */}
      <StatCard label="Khách chưa quay lại (1 đơn)" value={newCount} />
      <StatCard label="Khách quay lại (2+ đơn)" value={returningCount}>
        {rowsLength > 0 && (
          <p className="text-xs text-muted-foreground">
            {((returningCount / rowsLength) * 100).toFixed(0)}% tổng số khách
          </p>
        )}
      </StatCard>
    </div>
  );
}

// Ba bảng số cũ (mỗi bảng 3 cột × 10 dòng) đọc rất mỏi mắt và chiếm chỗ.
// Cùng một dữ liệu, ở dạng thanh ngang thì liếc phát thấy ngay ai vượt trội,
// mà cao chỉ còn bằng nửa. Mỗi thẻ giữ đúng MỘT màu — thanh dài ngắn mới
// mang thông tin, màu chỉ để phân biệt thẻ này với thẻ kia.
function CustomerRankCard({
  title,
  subtitle,
  rows,
  barColor,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  // Đã tổng hợp + cắt top-10 sẵn từ RPC — value là doanh số hoặc công nợ tuỳ thẻ.
  rows: { id: string; name: string; orderCount: number; value: number }[];
  barColor: string;
  emptyLabel: string;
}) {
  const points = rows.map((r) => ({
    label: r.name,
    value: r.value,
    meta: `${r.orderCount} đơn`,
    href: `/customers/${r.id}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <RevenueBarList
          points={points}
          barColor={barColor}
          layout="stacked"
          emptyLabel={emptyLabel}
        />
      </CardContent>
    </Card>
  );
}


export function CustomerReportSection({
  data,
  showRankings = true,
  showDormant = true,
  showDebt = true,
}: {
  // Ba khối này bật/tắt độc lập vì CEO chia quyền khác nhau cho từng vai trò:
  //   - Cửa hàng trưởng: không xem cả ba, chỉ cần số lượng/cơ cấu và tăng
  //     trưởng khách của chi nhánh mình.
  //   - Admin: giữ CÔNG NỢ (cần để đôn đốc thu tiền cùng đơn hàng), bỏ xếp
  //     hạng doanh số và danh sách khách nguội.
  //   - Giám đốc/Kế toán: xem đủ.
  showRankings?: boolean;
  showDormant?: boolean;
  showDebt?: boolean;
  data: CustomerReportData;
}) {
  const topCompanyByRevenue = data.topCompanies.map((r) => ({ ...r, value: r.totalRevenue }));
  const debtRows = data.debt.map((r) => ({ ...r, value: r.totalOwed }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Báo cáo khách hàng</h2>

      <CustomerOverviewTiles stats={data.stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewCustomersCard points={data.monthlyNew} />
        <ReturningRateCard ratePoints={data.returningRate} />
      </div>

      {/* Thẻ "Khách nguội cần gọi lại" tạm ẩn (CEO 2026-08-02: sẽ dùng lại
          sau) — khi bật lại cần bổ sung mảng dormant vào RPC
          customer_page_report rồi truyền xuống đây thay cho []. */}
      {false && showDormant && <DormantCustomersCard rows={[]} />}

      {(showRankings || showDebt) && (
        // Bỏ xếp hạng thì chỉ còn công nợ — để nguyên 3 cột sẽ thành một thẻ
        // hẹp tí trơ trọi, nên khi đó cho nó chiếm cả hàng.
        // 2 cột khi thẻ "Khách cá nhân" đang ẩn — trả về lg:grid-cols-3 khi
        // bật lại thẻ đó.
        <div className={`grid grid-cols-1 gap-4 ${showRankings ? "lg:grid-cols-2" : ""}`}>
          {showRankings && (
            <>
              <CustomerRankCard
                title="Khách công ty"
                subtitle="Doanh số cao nhất"
                rows={topCompanyByRevenue}
                barColor="var(--chart-1)"
                emptyLabel="Chưa có khách công ty nào phát sinh doanh số."
              />
              {/* Thẻ "Khách cá nhân" tạm ẩn (CEO 2026-08-02: sẽ dùng lại
                  sau) — khi bật lại, thêm mảng topIndividuals vào RPC
                  customer_page_report (lọc customer_type='individual') rồi
                  truyền vào đây. */}
            </>
          )}

          {showDebt && (
            <CustomerRankCard
              title="Công nợ"
              subtitle="Còn nợ nhiều nhất"
              rows={debtRows}
              barColor="var(--destructive)"
              emptyLabel="Không có khách nào còn nợ."
            />
          )}
        </div>
      )}
    </div>
  );
}
