import { Card, CardContent } from "@/components/ui/card";

// Thẻ số liệu gọn — label nhỏ + số lớn trong 1 CardContent duy nhất (không
// tách CardHeader) để đỡ tốn chiều cao khi xếp nhiều thẻ cạnh nhau, dùng
// chung cho mọi màn hình có dạng "tổng quan" (đơn hàng, khách hàng, thiết
// bị, bảng lương...).
export function StatCard({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}
