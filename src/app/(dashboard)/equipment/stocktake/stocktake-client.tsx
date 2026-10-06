"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyStocktake, exportStocktakeCsv, previewStocktake, type StocktakePreview } from "@/lib/actions/stocktake";
import { parseCsv, rowsFromCsv, type StocktakeRow } from "@/lib/stocktake-csv";

export function StocktakeClient({
  branches,
  categories,
  lockedBranchId,
}: {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  lockedBranchId: string | null;
}) {
  const [branchId, setBranchId] = useState(lockedBranchId ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<StocktakeRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<StocktakePreview | null>(null);
  const [exporting, startExport] = useTransition();
  const [checking, startCheck] = useTransition();
  const [applying, startApply] = useTransition();

  function doExport() {
    startExport(async () => {
      const r = await exportStocktakeCsv(branchId || null, categoryId || null, search.trim() || null);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      if (!r.count) {
        toast.warning("Không có máy nào khớp bộ lọc.");
        return;
      }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const branch = branches.find((b) => b.id === branchId)?.name ?? "tat-ca-kho";
      a.href = URL.createObjectURL(blob);
      a.download = `kiem-kho-${branch}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, "-");
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Đã xuất ${r.count} máy.`);
    });
  }

  async function onFile(file: File | undefined) {
    setPreview(null);
    setRows(null);
    if (!file) return;
    setFileName(file.name);
    const parsed = rowsFromCsv(parseCsv(await file.text()));
    if ("error" in parsed) return toast.error(parsed.error);
    if (!parsed.rows.length) return toast.warning("File không có dòng nào.");
    setRows(parsed.rows);
    startCheck(async () => setPreview(await previewStocktake(parsed.rows)));
  }

  function doApply() {
    if (!rows) return;
    startApply(async () => {
      const r = await applyStocktake(rows);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Đã ghi: ${r.updated} máy sửa · ${r.created} máy mới · ${r.deleted} máy xoá · ${r.retired} máy chuyển thanh lý.`,
      );
      setPreview(null);
      setRows(null);
      setFileName("");
    });
  }

  const totalChanges = preview ? preview.updates.length + preview.creates.length + preview.deletes.length : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/70 dark:bg-blue-950/30">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
          <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</span>
          Xuất file
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="st_branch">Kho</Label>
            <select
              id="st_branch"
              value={branchId}
              disabled={!!lockedBranchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Tất cả kho</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_cat">Nhóm hàng</Label>
            <select
              id="st_cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Tất cả nhóm</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_q">Tên hàng chứa</Label>
            <Input
              id="st_q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="vd: ecoflow, ipad"
              className="h-9 w-48 bg-background"
            />
          </div>
          <Button onClick={doExport} disabled={exporting} className="h-9">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Xuất file CSV
          </Button>
        </div>
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          <li>Mở bằng Google Sheets (Tệp → Nhập → Tải lên) hoặc Excel. Giữ nguyên dòng tiêu đề và cột “Mã nội bộ”.</li>
          <li>Sửa serial / biến thể / kho / ghi chú / ngày hết bảo hành (31/12/2027) trực tiếp trên dòng.</li>
          <li>Máy mới: thêm dòng, để trống “Mã nội bộ”, ghi đúng tên Mã hàng, Serial, Kho.</li>
          <li>Máy không còn: ghi “xoá” ở cột Hành động. Máy có lịch sử thuê sẽ chuyển “đã thanh lý” để giữ lịch sử.</li>
          <li>Xong: Google Sheets → Tệp → Tải xuống → CSV; Excel → Lưu thành CSV UTF-8.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">2</span>
          Tải file đã sửa lên & kiểm tra
        </h2>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-background px-4 py-3 text-sm hover:border-emerald-500">
          <FileUp className="size-5 text-emerald-600" />
          <span>{fileName || "Chọn file CSV…"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              // Cho chọn lại cùng 1 file (sửa xong lưu đè rồi tải lên lại).
              e.target.value = "";
            }}
          />
        </label>
        {checking && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang so với dữ liệu CRM…
          </p>
        )}
      </section>

      {preview && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/70 dark:bg-violet-950/30">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
            <span className="flex size-6 items-center justify-center rounded-full bg-violet-600 text-xs text-white">3</span>
            Xem trước thay đổi
          </h2>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-background px-3 py-1">Sửa: <b>{preview.updates.length}</b></span>
            <span className="rounded-full bg-background px-3 py-1">Thêm mới: <b>{preview.creates.length}</b></span>
            <span className="rounded-full bg-background px-3 py-1">Xoá / thanh lý: <b>{preview.deletes.length}</b></span>
            <span className="rounded-full bg-background px-3 py-1">Không đổi: <b>{preview.unchanged}</b></span>
            {preview.errors.length > 0 && (
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">
                Lỗi: <b>{preview.errors.length}</b>
              </span>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="mb-3 rounded-lg border border-destructive/40 bg-background p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <TriangleAlert className="size-4" /> Sửa các dòng lỗi trong file rồi tải lên lại — chưa ghi gì cả
              </p>
              <ul className="max-h-60 space-y-0.5 overflow-y-auto text-sm">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    <b>Dòng {e.line}:</b> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border bg-background p-3 text-sm">
            {preview.updates.map((u) => (
              <p key={u.id}>
                <span className="text-muted-foreground">Dòng {u.line} · {u.typeName} ·</span> <b>{u.serial}</b>:{" "}
                {u.changes.join(" · ")}
              </p>
            ))}
            {preview.creates.map((c) => (
              <p key={c.line} className="text-emerald-700 dark:text-emerald-400">
                <span className="text-muted-foreground">Dòng {c.line} ·</span> + Thêm <b>{c.serial}</b> — {c.typeName}
                {c.variant ? ` (${c.variant})` : ""} · {c.branch}
              </p>
            ))}
            {preview.deletes.map((d) => (
              <p key={d.id} className="text-red-700 dark:text-red-400">
                <span className="text-muted-foreground">Dòng {d.line} ·</span> −{" "}
                {d.mode === "retire" ? "Chuyển thanh lý (giữ lịch sử)" : "Xoá"} <b>{d.serial}</b> — {d.typeName}
              </p>
            ))}
            {!totalChanges && !preview.errors.length && (
              <p className="text-muted-foreground">File không có thay đổi nào so với CRM.</p>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button
              onClick={doApply}
              disabled={applying || !!preview.errors.length || !totalChanges}
              className="h-10 px-5"
            >
              {applying ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Áp dụng {totalChanges} thay đổi
            </Button>
            {!!preview.errors.length && (
              <span className="text-sm text-muted-foreground">Còn lỗi nên chưa áp dụng được.</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
