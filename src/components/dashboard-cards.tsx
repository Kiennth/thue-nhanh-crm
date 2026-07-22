import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RevenueBarList,
  formatCount,
  formatPercent,
  type RevenuePoint,
} from "@/components/revenue-bar-list";
import { PeriodPicker } from "@/components/period-picker";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function formatDayLabel(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// 3 card doanh thu theo kỳ (ngày/tháng/năm) kèm ô chọn kỳ bất kì — dùng chung
// cho trang chủ (toàn công ty) và trang dashboard từng chi nhánh.
export function PeriodRevenueCards({
  day,
  month,
  year,
  isToday,
  isThisMonth,
  isThisYear,
  dayRevenue,
  monthRevenue,
  yearRevenue,
}: {
  day: string;
  month: string;
  year: string;
  isToday: boolean;
  isThisMonth: boolean;
  isThisYear: boolean;
  dayRevenue: number;
  monthRevenue: number;
  yearRevenue: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isToday ? "Doanh thu hôm nay" : `Doanh thu ngày ${formatDayLabel(day)}`}
          </CardTitle>
          <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{currencyFormatter.format(dayRevenue)}đ</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isThisMonth
              ? "Doanh thu tháng này"
              : `Doanh thu tháng ${month.split("-")[1]}/${month.split("-")[0]}`}
          </CardTitle>
          <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{currencyFormatter.format(monthRevenue)}đ</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isThisYear ? "Doanh thu năm nay" : `Doanh thu năm ${year}`}
          </CardTitle>
          <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{currencyFormatter.format(yearRevenue)}đ</p>
        </CardContent>
      </Card>
    </div>
  );
}

// 3 card sản phẩm nổi bật: cho thuê nhiều nhất, chủ lực (doanh thu cao nhất),
// tỉ suất lợi nhuận cao nhất.
export function ProductHighlightCards({
  mostRented,
  flagship,
  topMargin,
}: {
  mostRented: RevenuePoint[];
  flagship: RevenuePoint[];
  topMargin: RevenuePoint[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cho thuê nhiều nhất</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueBarList points={mostRented} formatValue={formatCount} labelWidthClassName="w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sản phẩm chủ lực (doanh thu cao nhất)</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueBarList points={flagship} labelWidthClassName="w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ suất lợi nhuận cao nhất</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueBarList points={topMargin} formatValue={formatPercent} labelWidthClassName="w-32" />
        </CardContent>
      </Card>
    </div>
  );
}
