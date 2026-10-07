export type PurchaseStatus = "draft" | "ordered" | "received" | "cancelled";
export type PurchaseKind = "new" | "backfill";

// Nhãn trạng thái — phiếu "ghi lại hàng đã có" xong thì là "Đã ghi nhận".
export function statusLabel(status: PurchaseStatus, kind: PurchaseKind): string {
  if (kind === "backfill" && status === "received") return "Đã ghi nhận";
  if (kind === "backfill" && status === "ordered") return "Đã đặt";
  return PURCHASE_STATUS[status].label;
}

export const KIND_BADGE: Record<PurchaseKind, { label: string; className: string }> = {
  new: { label: "Mua mới", className: "bg-sky-500/12 text-sky-800 dark:text-sky-300" },
  backfill: { label: "Ghi lại hàng có sẵn", className: "bg-violet-500/15 text-violet-800 dark:text-violet-300" },
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
  ordered: { label: "Đã đặt — chờ hàng", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  received: { label: "Đã nhập kho", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  cancelled: { label: "Đã huỷ", className: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
};

export const PAYMENT_METHOD: Record<"chuyen_khoan" | "tien_mat" | "khac", string> = {
  chuyen_khoan: "Chuyển khoản",
  tien_mat: "Tiền mặt",
  khac: "Khác",
};

export const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";

export function paymentState(total: number, paid: number): { label: string; className: string } {
  if (total <= 0) return { label: "—", className: "text-muted-foreground" };
  if (paid <= 0) return { label: "Chưa trả", className: "text-rose-700 dark:text-rose-400" };
  if (paid < total) return { label: "Trả một phần", className: "text-amber-700 dark:text-amber-400" };
  return { label: "Đã trả đủ", className: "text-emerald-700 dark:text-emerald-400" };
}
