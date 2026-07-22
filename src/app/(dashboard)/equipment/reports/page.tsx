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
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";
import { PRODUCT_TYPE_LABELS } from "@/lib/equipment-labels";

const VIEW_ROLES = ["admin", "ke_toan"] as const;
const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default async function EquipmentReportsPage() {
  await requireRole([...VIEW_ROLES]);

  const supabase = await createClient();
  const [
    { data: types },
    { data: units },
    { data: instances },
    { data: purchases },
    { data: disposals },
    { data: stock },
    { data: orderLines },
  ] = await Promise.all([
    supabase.from("equipment_types").select("id, name, product_type").order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase
      .from("equipment_instances")
      .select("equipment_type_id, purchase_price, disposal_price, status"),
    supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
    supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
    supabase.from("equipment_stock").select("equipment_unit_id, quantity_total"),
    supabase.from("order_equipment").select("equipment_type_id, line_total"),
  ]);

  const typeList = types ?? [];
  const reports = computeEquipmentTypeReports(
    typeList,
    units ?? [],
    instances ?? [],
    purchases ?? [],
    disposals ?? [],
    stock ?? [],
    orderLines ?? [],
  );

  const rows = typeList.map((type) => ({
    type,
    report: reports.get(type.id)!,
  }));

  const rentalRows = rows
    .filter((r) => r.type.product_type === "rental")
    .sort((a, b) => b.report.rentalCount - a.report.rentalCount);

  const profitRows = [...rows].sort((a, b) => {
    const roiA = a.report.roi ?? -Infinity;
    const roiB = b.report.roi ?? -Infinity;
    return roiB - roiA;
  });

  const totalInventoryValue = rows.reduce((sum, r) => sum + r.report.currentInventoryValue, 0);
  const totalUnitsInStock =
    (stock ?? []).reduce((sum, s) => sum + s.quantity_total, 0) +
    (instances ?? []).filter((i) => i.status !== "disposed").length;
  const averageInventoryValue = totalUnitsInStock > 0 ? totalInventoryValue / totalUnitsInStock : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Báo cáo thiết bị</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Giá trị tồn kho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Tổng giá trị tồn kho</p>
              <p className="text-lg font-medium">{currencyFormatter.format(totalInventoryValue)}đ</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Số thiết bị đang giữ</p>
              <p className="text-lg font-medium">{totalUnitsInStock}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Giá trị trung bình / thiết bị</p>
              <p className="text-lg font-medium">{currencyFormatter.format(averageInventoryValue)}đ</p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng hoá</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Giá trị tồn kho hiện tại</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ type, report }) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>{PRODUCT_TYPE_LABELS[type.product_type]}</TableCell>
                  <TableCell>{currencyFormatter.format(report.currentInventoryValue)}đ</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Chưa có dữ liệu.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cho thuê nhiều nhất</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng hoá</TableHead>
                <TableHead>Số lượt xuất hiện trong đơn</TableHead>
                <TableHead>Doanh thu cho thuê</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rentalRows.map(({ type, report }) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>{report.rentalCount}</TableCell>
                  <TableCell>{currencyFormatter.format(report.revenue)}đ</TableCell>
                </TableRow>
              ))}
              {!rentalRows.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Chưa có hàng cho thuê nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ suất lợi nhuận</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Lợi nhuận = Doanh thu (cho thuê/bán) + Tiền thu thanh lý − Giá vốn mua vào. ROI = Lợi
            nhuận / Giá vốn.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng hoá</TableHead>
                <TableHead>Giá vốn</TableHead>
                <TableHead>Doanh thu</TableHead>
                <TableHead>Thu thanh lý</TableHead>
                <TableHead>Lợi nhuận</TableHead>
                <TableHead>ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profitRows.map(({ type, report }) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>{currencyFormatter.format(report.purchaseCost)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(report.revenue)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(report.disposalProceeds)}đ</TableCell>
                  <TableCell className={report.profit < 0 ? "text-destructive" : ""}>
                    {currencyFormatter.format(report.profit)}đ
                  </TableCell>
                  <TableCell>{report.roi === null ? "—" : `${(report.roi * 100).toFixed(0)}%`}</TableCell>
                </TableRow>
              ))}
              {!profitRows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Chưa có dữ liệu.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
