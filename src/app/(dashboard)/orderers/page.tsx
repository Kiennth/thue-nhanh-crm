import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchInput } from "@/components/search-input";
import { PaginationControls } from "@/components/pagination-controls";
import { requireRole } from "@/lib/dal";
import { ORDERER_VIEW_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { vnTodayString } from "@/lib/vn-time";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
// Quá số ngày này không đặt đơn mới → nhắc chăm sóc lại.
const STALE_DAYS = 60;
const PAGE_SIZE = 50;

type Orderer = { id: string; name: string; phone: string | null; email: string | null; title: string | null };
type Stat = {
  orderer_id: string;
  order_count: number;
  revenue: number;
  first_order_date: string | null;
  last_order_date: string | null;
  companies: string[] | null;
};

function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

// Người đặt hàng (CEO 2026-10-05): ai đang mang khách về, đặt cho những công
// ty nào, lâu rồi chưa đặt lại — để chăm sóc mối quan hệ. Hồ sơ tự tạo khi
// đơn có SĐT người đặt (trigger link_order_orderer).
export default async function OrderersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  await requireRole([...ORDERER_VIEW_ROLES]);
  const { q, sort, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: orderers }, { data: stats }] = await Promise.all([
    db.from("orderers").select("id, name, phone, email, title").limit(2000),
    db.rpc("orderer_stats"),
  ]);
  const statById = new Map(((stats ?? []) as Stat[]).map((s) => [s.orderer_id, s]));
  const today = vnTodayString();
  const needle = query.toLowerCase();
  const digits = query.replace(/\D/g, "");

  const rows = ((orderers ?? []) as Orderer[])
    .map((o) => ({ ...o, stat: statById.get(o.id) }))
    .filter((o) => {
      if (!query) return true;
      const hay = [o.name, o.email, o.title, ...(o.stat?.companies ?? [])].join(" ").toLowerCase();
      return hay.includes(needle) || (digits.length >= 3 && (o.phone ?? "").replace(/\D/g, "").includes(digits));
    })
    .sort((a, b) =>
      sort === "revenue"
        ? (b.stat?.revenue ?? 0) - (a.stat?.revenue ?? 0)
        : sort === "stale"
          ? (a.stat?.last_order_date ?? "").localeCompare(b.stat?.last_order_date ?? "")
          : (b.stat?.last_order_date ?? "").localeCompare(a.stat?.last_order_date ?? ""),
    );
  // Chia trang 50 dòng (đề xuất CRM v2: danh sách dài phải có số trang).
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(pageParam) || 1));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const staleCount = rows.filter((r) => r.stat?.last_order_date && daysSince(r.stat.last_order_date, today) > STALE_DAYS).length;

  const sortLink = (key: string, label: string) => {
    const active = (sort ?? "recent") === key;
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (key !== "recent") p.set("sort", key);
    return (
      <Link
        href={`/orderers${p.toString() ? `?${p}` : ""}`}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Người đặt hàng</h1>
        <p className="text-sm text-muted-foreground">
          Người liên hệ đặt đơn — theo người, không theo công ty (họ chuyển việc, làm freelancer vẫn giữ 1 hồ sơ).
          Hồ sơ tự tạo khi đơn có SĐT người đặt. {staleCount > 0 && <b className="text-amber-600">{staleCount} người đã hơn {STALE_DAYS} ngày chưa đặt lại.</b>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          key={query}
          paramName="q"
          resetParams={["page"]}
          placeholder="Tìm theo tên, SĐT, email, công ty — gõ rồi Enter..."
          value={query}
          size="lg"
          className="w-full max-w-xl"
        />
        <div className="inline-flex rounded-lg border p-1">
          {sortLink("recent", "Đặt gần đây")}
          {sortLink("revenue", "Doanh số cao")}
          {sortLink("stale", "Lâu chưa đặt")}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Người đặt</TableHead>
            <TableHead>Đã đặt cho</TableHead>
            <TableHead className="w-20 text-right">Số đơn</TableHead>
            <TableHead className="w-36 text-right">Doanh số (đã giao)</TableHead>
            <TableHead className="w-40">Lần đặt gần nhất</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((o) => {
            const last = o.stat?.last_order_date ?? null;
            const ago = last ? daysSince(last, today) : null;
            return (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/orderers/${o.id}`} className="font-semibold hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[o.phone, o.email].filter(Boolean).join(" · ")}
                    {o.title && <span className="block">{o.title}</span>}
                  </p>
                </TableCell>
                <TableCell className="max-w-md text-sm">
                  {(o.stat?.companies ?? []).join(" · ") || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.stat?.order_count ?? 0}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{vnd.format(o.stat?.revenue ?? 0)}đ</TableCell>
                <TableCell className="text-sm">
                  {last ? (
                    <>
                      {last.split("-").reverse().join("/")}
                      <span
                        className={`ml-1.5 rounded-full px-1.5 text-xs ${
                          ago! > STALE_DAYS ? "bg-amber-500/15 font-semibold text-amber-700" : "text-muted-foreground"
                        }`}
                      >
                        {ago === 0 ? "hôm nay" : `${ago} ngày trước`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {query ? "Không tìm thấy người đặt nào." : "Chưa có người đặt nào — nhập SĐT người đặt trên đơn là hồ sơ tự tạo."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <PaginationControls page={page} totalPages={totalPages} totalCount={rows.length} itemLabel="người đặt" />
    </div>
  );
}
