import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatVND } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CsvButton } from "./csv-button";

// Doanh thu theo nhóm hàng (giai đoạn 6, Grok 10/10 §7): RPC
// revenue_by_category — đơn đã giao, gồm VAT, theo ngày giao; tiền đơn chia
// về dòng theo tỉ lệ thành tiền (đã trừ giảm giá cả đơn).
export const CATEGORY_PERIODS = [
  { key: "month", label: "Tháng này" },
  { key: "prevMonth", label: "Tháng trước" },
  { key: "year", label: "Năm nay" },
  { key: "12m", label: "12 tháng qua" },
] as const;
export type CategoryPeriod = (typeof CATEGORY_PERIODS)[number]["key"];

const pad = (n: number) => String(n).padStart(2, "0");
function range(period: CategoryPeriod, today: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  if (period === "prevMonth") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(last)}`];
  }
  if (period === "year") return [`${y}-01-01`, today];
  if (period === "12m") {
    const sy = m === 12 ? y : y - 1;
    const sm = m === 12 ? 1 : m + 1;
    return [`${sy}-${pad(sm)}-01`, today];
  }
  return [`${y}-${pad(m)}-01`, today];
}

export async function CategoryRevenue({
  period,
  today,
  branchId,
  branches,
  lockBranch,
}: {
  period: CategoryPeriod;
  today: string;
  branchId: string | null;
  branches: { id: string; name: string }[];
  lockBranch: boolean;
}) {
  const [from, to] = range(period, today);
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase.rpc("revenue_by_category", { p_from: from, p_to: to, p_branch_id: branchId });
  const r = (data ?? { total: 0, orders: 0, rows: [] }) as {
    total: number;
    orders: number;
    rows: { category_id: string | null; name: string; revenue: number; orders: number; qty: number }[];
  };
  const sum = r.rows.reduce((s, x) => s + Number(x.revenue), 0) || 1;
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ tab: "category", period });
    if (branchId) p.set("branch", branchId);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/reports?${p.toString()}`;
  };
  const fmtDay = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={href({ period: p.key })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              period === p.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {p.label}
          </Link>
        ))}
        {!lockBranch && (
          <div className="flex gap-1 sm:ml-auto">
            {[{ id: null as string | null, name: "Tất cả" }, ...branches].map((b) => (
              <Link
                key={b.id ?? "all"}
                href={href({ branch: b.id })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  branchId === b.id ? "border-foreground/40 bg-muted" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {b.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          {fmtDay(from)} – {fmtDay(to)} · <b>{formatVND(r.total)}</b> (gồm VAT) · {r.orders} đơn đã giao
        </p>
        <CsvButton
          filename={`doanh-thu-nhom-hang_${from}_${to}.csv`}
          header={["Nhóm hàng", "Doanh thu (gồm VAT)", "Tỉ lệ %", "Số đơn", "Số lượng"]}
          rows={r.rows.map((x) => [
            x.name,
            String(x.revenue),
            ((Number(x.revenue) / sum) * 100).toFixed(1),
            String(x.orders),
            String(x.qty),
          ])}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nhóm hàng</th>
              <th className="px-3 py-2 text-right">Doanh thu (gồm VAT)</th>
              <th className="w-1/3 px-3 py-2">Tỉ lệ</th>
              <th className="px-3 py-2 text-right">Số đơn</th>
              <th className="px-3 py-2 text-right">Số lượng</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.rows.map((x) => {
              const pct = (Number(x.revenue) / sum) * 100;
              return (
                <tr key={x.category_id ?? "none"}>
                  <td className="px-3 py-2 font-medium">{x.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatVND(Number(x.revenue))}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.qty}</td>
                </tr>
              );
            })}
            {!r.rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Không có đơn đã giao trong kỳ này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Doanh thu = đơn đã giao, gồm VAT, tính theo ngày giao. Tiền mỗi đơn chia về từng dòng hàng theo tỉ lệ thành tiền
        (đã trừ giảm giá cả đơn), cộng theo danh mục của mã hàng. Một đơn có nhiều nhóm hàng được đếm ở mỗi nhóm.
      </p>
    </div>
  );
}
