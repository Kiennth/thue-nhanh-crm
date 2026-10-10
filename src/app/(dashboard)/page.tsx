import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CircleDollarSign, Clock, FileWarning, Globe, PackageCheck, Truck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { MANAGE_ROLES, computeMyMonthlyTrend } from "@/lib/employee-performance-charts";
import { computeMyPerformance } from "@/lib/my-performance";
import { TECH_SALES_ROLES } from "@/lib/roles";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { loadShortages } from "@/lib/shortage";
import { formatVND } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TaskType } from "@/types/database";
import { MyPerformanceCard } from "./my-performance-card";
import { MyPerformanceTrendCard } from "./my-performance-trend-card";

// Trang "Hôm nay" (Grok tách gọn CRM 10/10, giai đoạn 1) thay Trang chủ cũ:
// hàng đợi việc cần làm — số đếm + 4 danh sách, mỗi danh sách tối đa 5 dòng,
// CHỈ hôm nay + ngày mai, 1 lần gọi DB (today_board). Biểu đồ so sánh kho +
// Lợi nhuận gộp sang trang Báo cáo; "Thu nhập của bạn" giữ dưới cùng (CEO
// 08/08, chốt lại 10/10) và tải sau cùng.

type Row = {
  id: string;
  order_code: string;
  customer_name: string | null;
  branch_id: string | null;
  at: string;
  status?: TaskType;
  done?: boolean;
  no_driver?: boolean;
  self_pickup?: boolean;
  no_serial?: boolean;
  no_collector?: boolean;
  remaining?: number;
};
type Board = {
  today: string;
  counts: {
    deliverToday: number;
    deliverTomorrow: number;
    deliverNoDriver: number;
    returnToday: number;
    returnTomorrow: number;
    returnNoCollector: number;
    overdue: number;
    owingCount: number;
    owingAmount: number;
    invoiceLate: number;
  };
  deliveries: Row[];
  returns: Row[];
  overdue: Row[];
  owing: Row[];
};

const SHORT_BRANCH: Record<string, string> = { "Hà Nội": "HN", "TP HCM": "HCM", "Đà Nẵng": "ĐN" };
const BRANCH_TONE: Record<string, string> = {
  HN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  HCM: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  ĐN: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const weekdayFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; mine?: string }>;
}) {
  const params = await searchParams;
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const canManage = (MANAGE_ROLES as readonly string[]).includes(employee.role);
  const isBranchManager = employee.role === "cua_hang_truong";
  const canSeeMoney = canManage || isBranchManager;
  const mine = params.mine === "1";

  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id, name").order("position");
  const branchList = branches ?? [];
  const branchId = branchList.some((b) => b.id === params.branch) ? params.branch! : null;
  const shortOf = new Map(branchList.map((b) => [b.id, SHORT_BRANCH[b.name] ?? b.name]));

  const qs = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { branch: branchId, mine: mine ? "1" : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Hôm nay <span className="font-normal text-muted-foreground">· {weekdayFmt.format(new Date())}</span>
          </h1>
          <p className="text-sm text-muted-foreground">Việc cần xử lý hôm nay và ngày mai — bấm số hoặc dòng để mở.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5 text-sm">
            {[{ id: null as string | null, name: "Tất cả" }, ...branchList].map((b) => (
              <Link
                key={b.id ?? "all"}
                href={qs({ branch: b.id })}
                className={cn(
                  "rounded-md px-3 py-1",
                  branchId === b.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {b.name}
              </Link>
            ))}
          </div>
          <div className="flex rounded-lg border p-0.5 text-sm">
            <Link href={qs({ mine: "1" })} className={cn("rounded-md px-3 py-1", mine ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              Của tôi
            </Link>
            <Link href={qs({ mine: null })} className={cn("rounded-md px-3 py-1", !mine ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              Cả kho
            </Link>
          </div>
        </div>
      </div>

      <Suspense fallback={<BoardSkeleton />}>
        <TodayBoard
          branchId={branchId}
          employeeId={mine ? employee.id : null}
          canSeeMoney={canSeeMoney}
          canSeeInvoices={canManage}
          shortOf={Object.fromEntries(shortOf)}
        />
      </Suspense>

      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border bg-muted/40" />}>
        <IncomeBlock
          employeeId={employee.id}
          employeeBranchId={employee.branch_id}
          baseSalary={employee.base_salary}
          withTrend={!(canManage || TECH_SALES_ROLES.includes(employee.role))}
        />
      </Suspense>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

const TONES = {
  rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-100",
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
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
    <Link href={href} className={cn("group rounded-xl border p-3.5 transition hover:shadow-md", TONES[tone])}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium opacity-80 [&_svg]:size-4">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs opacity-75 group-hover:underline">{sub}</p>
    </Link>
  );
}

async function TodayBoard({
  branchId,
  employeeId,
  canSeeMoney,
  canSeeInvoices,
  shortOf,
}: {
  branchId: string | null;
  employeeId: string | null;
  canSeeMoney: boolean;
  canSeeInvoices: boolean;
  shortOf: Record<string, string>;
}) {
  const supabase = await createClient();
  const [{ data, error }, webRes] = await Promise.all([
    supabase.rpc("today_board" as never, { p_branch_id: branchId, p_employee_id: employeeId, p_limit: 5 } as never),
    (supabase as unknown as SupabaseClient).from("website_orders").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  if (error || !data) {
    return <p className="text-sm text-destructive">Không tải được dữ liệu hôm nay: {error?.message ?? "không rõ"}</p>;
  }
  const b = data as unknown as Board;
  const c = b.counts;
  const webNew = webRes.count ?? 0;
  const branchChip = (id: string | null) => {
    const s = id ? shortOf[id] : null;
    return s ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", BRANCH_TONE[s])}>{s}</span> : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi
          href="/orders?view=deliver_today"
          label="Giao hôm nay / mai"
          value={`${c.deliverToday} / ${c.deliverTomorrow}`}
          sub={c.deliverNoDriver ? `${c.deliverNoDriver} chưa có người giao` : "Đã có người giao"}
          icon={<Truck />}
          tone={c.deliverNoDriver ? "amber" : "calm"}
        />
        <Kpi
          href="/orders?view=return_today"
          label="Thu hồi hôm nay / mai"
          value={`${c.returnToday} / ${c.returnTomorrow}`}
          sub={c.returnNoCollector ? `${c.returnNoCollector} chưa phân công` : "Đã phân công"}
          icon={<PackageCheck />}
          tone={c.returnNoCollector ? "amber" : "calm"}
        />
        <Kpi
          href="/orders?view=overdue"
          label="Quá hạn trả"
          value={String(c.overdue)}
          sub={c.overdue ? "đơn quá giờ trả — bấm để xử lý" : "Không có đơn quá hạn"}
          icon={<Clock />}
          tone={c.overdue ? "rose" : "calm"}
        />
        <Kpi
          href="/orders/web"
          label="Đơn web mới"
          value={String(webNew)}
          sub={webNew ? "khách gửi từ thuenhanh.vn" : "Không có đơn web mới"}
          icon={<Globe />}
          tone={webNew ? "violet" : "calm"}
        />
        {canSeeMoney && (
          <Kpi
            href="/debts"
            label="Hoàn tất còn nợ"
            value={String(c.owingCount)}
            sub={c.owingCount ? `${formatVND(c.owingAmount)} · 30 ngày qua` : "Không có"}
            icon={<CircleDollarSign />}
            tone={c.owingCount ? "amber" : "calm"}
          />
        )}
        {canSeeInvoices && (
          <Kpi
            href="/invoices"
            label="Chưa xuất HĐ > 2 ngày"
            value={String(c.invoiceLate)}
            sub={c.invoiceLate ? "đơn hoàn tất chờ hoá đơn đỏ" : "Đã xuất kịp"}
            icon={<FileWarning />}
            tone={c.invoiceLate ? "violet" : "calm"}
          />
        )}
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl border bg-muted/40" />}>
          <ShortageKpi branchId={branchId} />
        </Suspense>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Giao hàng · hôm nay & mai"
          href="/orders?view=deliver_today"
          total={c.deliverToday + c.deliverTomorrow}
          empty="Không có đơn giao hôm nay và ngày mai."
          rows={b.deliveries}
          render={(r) => (
            <>
              <Cell className="w-24 tabular-nums">{timeFmt.format(new Date(r.at))}</Cell>
              <OrderCell r={r} />
              <Cell className="w-12">{branchChip(r.branch_id)}</Cell>
              <Cell className="w-44 text-right">
                {r.done ? (
                  <Chip tone="emerald">Đã giao</Chip>
                ) : r.no_serial ? (
                  <Chip tone="amber">Chưa gán serial</Chip>
                ) : r.no_driver ? (
                  <Chip tone="amber">Chưa người giao</Chip>
                ) : r.self_pickup ? (
                  <Chip tone="calm">Khách tự lấy</Chip>
                ) : (
                  <Chip tone="calm">{r.status ? TASK_TYPE_LABELS[r.status] : "—"}</Chip>
                )}
              </Cell>
            </>
          )}
        />
        <ListCard
          title="Thu hồi · hôm nay & mai"
          href="/orders?view=return_today"
          total={c.returnToday + c.returnTomorrow}
          empty="Không có đơn trả hôm nay và ngày mai."
          rows={b.returns}
          render={(r) => (
            <>
              <Cell className="w-24 tabular-nums">{timeFmt.format(new Date(r.at))}</Cell>
              <OrderCell r={r} />
              <Cell className="w-12">{branchChip(r.branch_id)}</Cell>
              <Cell className="w-44 text-right">
                {r.no_collector ? (
                  <Chip tone="amber">Chưa phân công</Chip>
                ) : (
                  <Chip tone="calm">{r.status ? TASK_TYPE_LABELS[r.status] : "—"}</Chip>
                )}
              </Cell>
            </>
          )}
        />
        <ListCard
          title="Quá hạn trả"
          href="/orders?view=overdue"
          total={c.overdue}
          empty="Không có đơn quá hạn."
          rows={b.overdue}
          render={(r) => {
            // Số ngày trễ tính theo "hôm nay" của DB (giờ VN) — không gọi Date.now() lúc render.
            const late = Math.floor((Date.parse(`${b.today}T23:59:59+07:00`) - Date.parse(r.at)) / 86_400_000);
            return (
              <>
                <OrderCell r={r} />
                <Cell className="w-12">{branchChip(r.branch_id)}</Cell>
                <Cell className="w-20 tabular-nums">{late > 0 ? `${late} ngày` : "hôm nay"}</Cell>
                <Cell className="w-24 text-right">
                  <Chip tone="rose">Quá hạn</Chip>
                </Cell>
              </>
            );
          }}
        />
        {canSeeMoney && (
          <ListCard
            title="Hoàn tất nhưng còn nợ · 30 ngày"
            href="/debts"
            total={c.owingCount}
            empty="Không có đơn hoàn tất còn nợ."
            rows={b.owing}
            render={(r) => (
              <>
                <OrderCell r={r} />
                <Cell className="w-12">{branchChip(r.branch_id)}</Cell>
                <Cell className="w-32 text-right font-semibold tabular-nums">{formatVND(r.remaining)}</Cell>
              </>
            )}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Mỗi danh sách tối đa 5 dòng · &quot;Hoàn tất còn nợ&quot; chỉ tính đơn tạo trên CRM (mã PO) — tiền đơn Booqable
        nằm ở Booqable · so sánh kho &amp; lợi nhuận ở trang{" "}
        <Link href="/reports" className="text-primary hover:underline">
          Báo cáo
        </Link>
        .
      </p>
    </div>
  );
}

async function ShortageKpi({ branchId }: { branchId: string | null }) {
  const shortages = await loadShortages(7, branchId);
  const soon = shortages.filter((x) => !x.shortNow);
  const missing = soon.reduce((s, x) => s + x.missing, 0);
  return (
    <Kpi
      href="/shortages?days=7"
      label="Thiếu hàng 7 ngày"
      value={String(missing)}
      sub={soon.length ? `máy · ${soon.slice(0, 2).map((x) => x.typeName).join(", ")}` : "Đủ máy cho 7 ngày tới"}
      icon={<AlertTriangle />}
      tone={missing ? "amber" : "calm"}
    />
  );
}

const CHIP = {
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  rose: "bg-rose-600 text-white",
  calm: "bg-muted text-muted-foreground",
} as const;
function Chip({ tone, children }: { tone: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", CHIP[tone])}>{children}</span>;
}
function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("px-3 py-2 align-middle text-sm", className)}>{children}</td>;
}
function OrderCell({ r }: { r: Row }) {
  return (
    <td className="px-3 py-2 text-sm">
      <Link href={`/orders/${r.id}`} className="font-semibold text-primary hover:underline">
        {r.order_code}
      </Link>
      <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">{r.customer_name ?? "—"}</span>
    </td>
  );
}

function ListCard({
  title,
  href,
  total,
  empty,
  rows,
  render,
}: {
  title: string;
  href: string;
  total: number;
  empty: string;
  rows: Row[];
  render: (r: Row) => React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {total > 0 && (
          <Link href={href} className="text-xs font-medium text-primary hover:underline">
            Xem tất cả {total} →
          </Link>
        )}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  {render(r)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

// "Thu nhập của bạn" + xu hướng 6 tháng (chỉ nhân viên — quản lý và Kỹ
// thuật/Sales không tính xu hướng vì nặng).
async function IncomeBlock({
  employeeId,
  employeeBranchId,
  baseSalary,
  withTrend,
}: {
  employeeId: string;
  employeeBranchId: string | null;
  baseSalary: number;
  withTrend: boolean;
}) {
  const [myPerformance, myTrend] = await Promise.all([
    computeMyPerformance(employeeId, employeeBranchId, baseSalary),
    withTrend ? computeMyMonthlyTrend(employeeId) : Promise.resolve(null),
  ]);
  return (
    <>
      <MyPerformanceCard perf={myPerformance} />
      {myTrend && <MyPerformanceTrendCard points={myTrend} />}
    </>
  );
}
