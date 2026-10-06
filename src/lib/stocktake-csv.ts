// Kiểm kho bằng bảng tính (CEO 2026-10-06): xuất máy serial ra CSV → sửa trên
// Google Sheets / Excel → tải lên lại, xem trước rồi mới ghi. File này thuần
// (không server-only) — dùng chung cho trang (đọc file người dùng chọn) và
// server action (dựng file xuất).

export const STOCKTAKE_HEADERS = [
  "Mã nội bộ (đừng sửa)",
  "Mã hàng",
  "Biến thể",
  "Serial",
  "Kho",
  "Trạng thái (chỉ xem)",
  "Ghi chú",
  "Hết hạn bảo hành (dd/mm/yyyy)",
  "Hành động (trống / xoá)",
] as const;

export type StocktakeRow = {
  line: number; // số dòng trong file (1 = tiêu đề) để báo lỗi
  id: string;
  typeName: string;
  variant: string;
  serial: string;
  branch: string;
  note: string;
  warranty: string;
  action: string;
};

// CSV RFC 4180 tối giản: dấu phẩy hoặc chấm phẩy (Excel tiếng Việt hay xuất
// bằng ";"), ô có ngoặc kép, xuống dòng trong ô. Bỏ BOM đầu file.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM để Excel mở đúng tiếng Việt.
  return "﻿" + rows.map((r) => r.map((v) => esc(v ?? "")).join(",")).join("\r\n") + "\r\n";
}

// Đổi bảng thô → dòng có cấu trúc. Trả lỗi nếu sai khuôn (thiếu cột, đổi tiêu đề).
export function rowsFromCsv(table: string[][]): { rows: StocktakeRow[] } | { error: string } {
  if (!table.length) return { error: "File trống." };
  const header = table[0].map((h) => h.trim());
  if (!/mã nội bộ/i.test(header[0] ?? "") || header.length < STOCKTAKE_HEADERS.length) {
    return {
      error:
        "File không đúng mẫu kiểm kho — hãy xuất lại từ CRM, giữ nguyên dòng tiêu đề và thứ tự cột (Google Sheets: Tệp → Tải xuống → CSV).",
    };
  }
  const rows: StocktakeRow[] = [];
  table.slice(1).forEach((r, i) => {
    const cells = r.map((c) => (c ?? "").trim());
    if (!cells.some(Boolean)) return;
    rows.push({
      line: i + 2,
      id: cells[0] ?? "",
      typeName: cells[1] ?? "",
      variant: cells[2] ?? "",
      serial: cells[3] ?? "",
      branch: cells[4] ?? "",
      note: cells[6] ?? "",
      warranty: cells[7] ?? "",
      action: cells[8] ?? "",
    });
  });
  return { rows };
}

// So khớp tên không phân biệt hoa thường / dấu / khoảng trắng thừa.
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isDeleteAction(action: string): boolean {
  return ["xoa", "delete", "xoa may", "khong con", "mat"].includes(fold(action));
}

// Ngày bảo hành: nhận dd/mm/yyyy, d/m/yy, yyyy-mm-dd (Google Sheets/Excel hay
// đổi định dạng). Trả "yyyy-mm-dd", null nếu trống, undefined nếu sai.
export function parseDate(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  let y: number, mo: number, d: number;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
  } else return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function formatDateVN(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
