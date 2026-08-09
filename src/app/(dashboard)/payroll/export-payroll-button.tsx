"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PayrollExportRow {
  name: string;
  branchName: string;
  baseSalary: number;
  totalCommission: number;
  installationPayout: number;
  removalPayout: number;
  supportPayout: number;
  deliveryPayout: number;
  collectionPayout: number;
  overtimePay: number;
  rewardPay: number;
  bonus: number;
  totalIncome: number;
}

const COLUMNS: { header: string; key: keyof PayrollExportRow; money?: boolean }[] = [
  { header: "Nhân viên", key: "name" },
  { header: "Chi nhánh", key: "branchName" },
  { header: "Lương cứng", key: "baseSalary", money: true },
  { header: "Tổng khoán", key: "totalCommission", money: true },
  { header: "Lắp đặt", key: "installationPayout", money: true },
  { header: "Tháo dỡ", key: "removalPayout", money: true },
  { header: "Support", key: "supportPayout", money: true },
  { header: "Giao hàng", key: "deliveryPayout", money: true },
  { header: "Thu hồi", key: "collectionPayout", money: true },
  { header: "OT", key: "overtimePay", money: true },
  { header: "Thưởng đột xuất", key: "rewardPay", money: true },
  { header: "Thưởng", key: "bonus", money: true },
  { header: "Tổng thu nhập", key: "totalIncome", money: true },
];

// Xuất bảng lương tháng ra .xlsx ngay trên trình duyệt — dữ liệu đã có sẵn
// trong trang (đã được scope theo quyền của người xem), không gọi thêm server.
// exceljs nặng (~1MB) nên chỉ import khi thật sự bấm nút.
export function ExportPayrollButton({ month, rows }: { month: string; rows: PayrollExportRow[] }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Bảng lương ${month}`);

      sheet.columns = COLUMNS.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.key === "name" ? 24 : c.key === "branchName" ? 12 : 14,
        style: c.money ? { numFmt: "#,##0" } : undefined,
      }));

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: "center" };

      for (const row of rows) {
        sheet.addRow(row);
      }

      // Dòng tổng cộng toàn bảng.
      const totalRow = sheet.addRow({
        name: "TỔNG CỘNG",
        branchName: "",
        ...Object.fromEntries(
          COLUMNS.filter((c) => c.money).map((c) => [
            c.key,
            rows.reduce((sum, r) => sum + (r[c.key] as number), 0),
          ]),
        ),
      });
      totalRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bang-luong-${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !rows.length}>
      <Download className="size-4" />
      {exporting ? "Đang xuất..." : "Xuất Excel"}
    </Button>
  );
}
