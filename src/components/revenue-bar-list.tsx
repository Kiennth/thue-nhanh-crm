export interface RevenuePoint {
  label: string;
  value: number;
  // Ghi chú phụ đứng ngay sau nhãn (vd "37 đơn") — giữ số liệu thứ hai mà
  // không phải thêm cột, dòng vẫn gọn 1 hàng.
  meta?: string;
  href?: string;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)}đ`;
}

export function formatCount(value: number): string {
  return `${currencyFormatter.format(value)} lượt`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

// Bảng màu tươi cho chế độ colorByLabel — sắc 500, đọc được trên cả nền
// sáng lẫn tối.
const PRODUCT_PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
  "#06b6d4", "#f97316", "#84cc16", "#6366f1", "#14b8a6",
  "#e11d48", "#a855f7", "#eab308", "#0ea5e9", "#22c55e",
];

// Màu cố định theo TÊN (băm chuỗi) — cùng 1 sản phẩm luôn cùng màu ở mọi
// bảng/mọi kỳ, liếc qua 3 thẻ xếp hạng là nhận ra ngay món nào lặp lại.
export function colorForLabel(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return PRODUCT_PALETTE[h % PRODUCT_PALETTE.length];
}

export function RevenueBarList({
  points,
  formatValue = formatCurrency,
  labelWidthClassName = "w-14",
  // Mỗi thẻ một sắc riêng để liếc là biết đang đọc bảng nào. Trong TỪNG thẻ
  // vẫn chỉ 1 màu duy nhất — thanh dài ngắn mới là thứ mang thông tin, màu
  // không mã hoá giá trị nên không được đổi theo thứ hạng.
  barColor = "var(--primary)",
  // CEO 2026-09-25: mỗi sản phẩm một màu riêng (theo tên, xem colorForLabel)
  // thay cho 1 màu/thẻ — bỏ qua barColor khi bật.
  colorByLabel = false,
  emptyLabel = "Chưa có dữ liệu.",
  // "inline": nhãn ngắn nằm cùng hàng với thanh (tên thiết bị, đủ chỗ).
  // "stacked": tên dài đứng riêng một dòng, thanh chạy hết bề ngang bên dưới
  // — bắt buộc với tên công ty tiếng Việt, nếu nhét cùng hàng thì 10 dòng
  // đều cụt thành "CÔNG TY CỔ..." và hết nhận ra ai với ai.
  layout = "inline",
}: {
  points: RevenuePoint[];
  formatValue?: (value: number) => string;
  labelWidthClassName?: string;
  barColor?: string;
  colorByLabel?: boolean;
  emptyLabel?: string;
  layout?: "inline" | "stacked";
}) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));

  const bar = (value: number, label: string) => (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${(Math.abs(value) / max) * 100}%`,
          backgroundColor:
            value < 0 ? "var(--destructive)" : colorByLabel ? colorForLabel(label) : barColor,
        }}
      />
    </div>
  );

  if (layout === "stacked") {
    return (
      <div className="space-y-3">
        {points.map((p, i) => (
          <div key={p.href ?? i} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {p.href ? (
                <a href={p.href} className="truncate hover:underline" title={p.label}>
                  {p.label}
                </a>
              ) : (
                <span className="truncate" title={p.label}>
                  {p.label}
                </span>
              )}
              <span
                className={`shrink-0 tabular-nums ${p.value < 0 ? "text-destructive" : ""}`}
              >
                {formatValue(p.value)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {bar(p.value, p.label)}
              {p.meta && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {p.meta}
                </span>
              )}
            </div>
          </div>
        ))}
        {!points.length && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {points.map((p, i) => (
        <div key={p.href ?? i} className="flex items-center gap-3 text-sm">
          <span
            className={`${labelWidthClassName} shrink-0 truncate text-muted-foreground`}
            title={p.label}
          >
            {p.label}
          </span>
          {bar(p.value, p.label)}
          <span
            className={`w-28 shrink-0 text-right tabular-nums ${p.value < 0 ? "text-destructive" : ""}`}
          >
            {formatValue(p.value)}
          </span>
        </div>
      ))}
      {!points.length && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
    </div>
  );
}
