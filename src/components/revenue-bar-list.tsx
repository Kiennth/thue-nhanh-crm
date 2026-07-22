export interface RevenuePoint {
  label: string;
  value: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)}đ`;
}

export function formatCount(value: number): string {
  return `${currencyFormatter.format(value)} lượt`;
}

export function RevenueBarList({
  points,
  formatValue = formatCurrency,
  labelWidthClassName = "w-14",
}: {
  points: RevenuePoint[];
  formatValue?: (value: number) => string;
  labelWidthClassName?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <div className="space-y-2">
      {points.map((p, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className={`${labelWidthClassName} shrink-0 truncate text-muted-foreground`}>
            {p.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(p.value / max) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums">{formatValue(p.value)}</span>
        </div>
      ))}
      {!points.length && <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}
    </div>
  );
}
