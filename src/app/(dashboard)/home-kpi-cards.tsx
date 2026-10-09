import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, Clock, Globe, Truck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadShortages } from "@/lib/shortage";
import { cn } from "@/lib/utils";

// Hàng 4 thẻ bấm được đầu trang chủ (đề xuất CRM v2 §4.2, CEO 2026-10-09):
// Quá hạn trả · Thiếu hàng 7 ngày · Tiền chưa thu (người không xem tiền thấy
// "Hôm nay giao") · Đơn web mới. Bấm thẻ → danh sách đã lọc sẵn. Thay cho 2
// thanh báo Đơn web / Thiếu hàng cũ ở trang chủ (trang Đơn hàng vẫn giữ).
const vnd = new Intl.NumberFormat("vi-VN");
const short = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ` : n >= 1e6 ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : `${vnd.format(n)}đ`;

type Stats = { totalCount: number; stats: { unpaidAmount: number; unpaidCount: number } };

const TONES = {
  rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-100",
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
  violet: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100",
  calm: "border-border bg-card text-foreground",
} as const;

function Kpi({
  href,
  label,
  value,
  sub,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <Link href={href} className={cn("group rounded-xl border p-4 transition hover:shadow-md", TONES[tone])}>
      <p className="flex items-center gap-1.5 text-sm font-medium opacity-80 [&_svg]:size-4">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs opacity-75 group-hover:underline">{sub}</p>
    </Link>
  );
}

export async function HomeKpiCards({ branchId, canSeeMoney }: { branchId: string | null; canSeeMoney: boolean }) {
  const supabase = await createClient();
  const [overdueRes, moneyRes, todayRes, webRes, shortages] = await Promise.all([
    supabase.rpc("orders_page_list", { p_branch_id: branchId, p_page: 1, p_page_size: 1, p_view: "overdue" }),
    canSeeMoney
      ? supabase.rpc("orders_page_list", { p_branch_id: branchId, p_page: 1, p_page_size: 1, p_unpaid_only: true })
      : Promise.resolve({ data: null }),
    canSeeMoney
      ? Promise.resolve({ data: null })
      : supabase.rpc("orders_page_list", { p_branch_id: branchId, p_page: 1, p_page_size: 1, p_view: "deliver_today" }),
    (supabase as unknown as SupabaseClient)
      .from("website_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    loadShortages(7, branchId),
  ]);
  const overdue = (overdueRes.data as Stats | null)?.totalCount ?? 0;
  const money = (moneyRes.data as Stats | null)?.stats;
  const today = (todayRes.data as Stats | null)?.totalCount ?? 0;
  const webNew = webRes.count ?? 0;
  const soon = shortages.filter((x) => !x.shortNow);
  const missing = soon.reduce((s, x) => s + x.missing, 0);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        href="/orders?view=overdue"
        label="Quá hạn trả"
        value={String(overdue)}
        sub={overdue ? "đơn đã quá giờ trả — bấm để xem" : "Không có đơn quá hạn"}
        icon={<Clock />}
        tone={overdue ? "rose" : "calm"}
      />
      <Kpi
        href="/shortages?days=7"
        label="Thiếu hàng 7 ngày"
        value={String(missing)}
        sub={
          soon.length
            ? `máy · ${soon.slice(0, 2).map((x) => x.typeName).join(", ")}${soon.length > 2 ? "…" : ""}`
            : "Đủ máy cho 7 ngày tới"
        }
        icon={<AlertTriangle />}
        tone={missing ? "amber" : "calm"}
      />
      {canSeeMoney ? (
        <Kpi
          href={branchId ? "/orders?paid=unpaid" : "/debts"}
          label="Tiền chưa thu"
          value={short(money?.unpaidAmount ?? 0)}
          sub={`${vnd.format(money?.unpaidCount ?? 0)} đơn đã giao chưa thu đủ — bấm xem ${branchId ? "đơn" : "sổ công nợ"}`}
          icon={<Wallet />}
          tone="sky"
        />
      ) : (
        <Kpi
          href="/orders?view=deliver_today"
          label="Hôm nay giao"
          value={String(today)}
          sub="đơn nhận máy hôm nay"
          icon={<Truck />}
          tone="sky"
        />
      )}
      <Kpi
        href="/orders/web"
        label="Đơn web mới"
        value={String(webNew)}
        sub={webNew ? "khách gửi từ thuenhanh.vn — gọi xác nhận" : "Không có đơn web mới"}
        icon={<Globe />}
        tone={webNew ? "violet" : "calm"}
      />
    </div>
  );
}
