"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// Xuất bảng ra CSV (mở bằng Excel) — có BOM để Excel đọc đúng tiếng Việt.
export function CsvButton({ filename, header, rows }: { filename: string; header: string[]; rows: string[][] }) {
  const download = () => {
    const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onClick={download} disabled={!rows.length}>
      <Download className="size-4" />
      Xuất Excel (CSV)
    </Button>
  );
}
