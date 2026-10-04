import Link from "next/link";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { loadPlaceholderNeeds, loadShortages } from "@/lib/shortage";

const SPANS = [7, 14, 30] as const;
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VN_TIME_ZONE,
});
const dayFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: VN_TIME_ZONE });

// Thiếu hàng & cần mua (CEO 2026-10-04): mã nào N ngày tới các đơn cần nhiều
// hơn số máy kho đang có, và máy tạm CHỜ MUA còn nằm trong đơn.
export default async function ShortagesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireRole([...ALL_ROLES]);
  const { days: daysParam } = await searchParams;
  const days = (SPANS as readonly number[]).includes(Number(daysParam)) ? Number(daysParam) : 14;
  const [shortages, placeholders] = await Promise.all([loadShortages(days), loadPlaceholderNeeds()]);
  const totalMissing = shortages.reduce((s, x) => s + x.missing, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Thiếu hàng &amp; cần mua</h1>
          <p className="text-sm text-muted-foreground">
            So số máy kho đang có với số máy các đơn cần cùng lúc. Thiếu thì mua thêm, mượn kho khác hoặc đổi
            máy tương đương.
          </p>
        </div>
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {SPANS.map((s) => (
            <Link
              key={s}
              href={`/shortages?days=${s}`}
              className={`rounded-md px-3 py-1.5 font-medium ${days === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {s} ngày tới
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-5 text-amber-500" />
            {shortages.length
              ? `${shortages.length} mã hàng thiếu (tổng ${totalMissing} máy) trong ${days} ngày tới`
              : `Không thiếu mã nào trong ${days} ngày tới`}
          </CardTitle>
        </CardHeader>
        {shortages.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã hàng</TableHead>
                  <TableHead className="w-24">Kho</TableHead>
                  <TableHead className="w-16 text-right">Có</TableHead>
                  <TableHead className="w-20 text-right">Cần</TableHead>
                  <TableHead className="w-16 text-right">Thiếu</TableHead>
                  <TableHead className="w-36">Bắt đầu thiếu</TableHead>
                  <TableHead>Đơn đang cần máy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortages.map((s) => (
                  <TableRow key={`${s.typeId}-${s.branchId}`}>
                    <TableCell className="font-medium">
                      <Link href={`/calendar?q=${encodeURIComponent(s.typeName)}`} className="hover:underline">
                        {s.typeName}
                      </Link>
                      {!s.serial && <span className="ml-1 text-xs text-muted-foreground">(số lượng)</span>}
                    </TableCell>
                    <TableCell>{s.branchName}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.capacity}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.peak}</TableCell>
                    <TableCell className="text-right">
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-sm font-bold text-red-600 tabular-nums">
                        −{s.missing}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{timeFmt.format(new Date(s.firstAt))}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {s.orders.map((o) => (
                          <Link key={o.id} href={`/orders/${o.id}`} className="hover:underline">
                            <span className="font-medium">{o.code}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              ×{o.quantity} · {dayFmt.format(new Date(o.start))}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-5 text-primary" />
            {placeholders.length
              ? `Máy CHỜ MUA đang nằm trong đơn (${placeholders.reduce((s, g) => s + g.count, 0)} máy)`
              : "Không có máy CHỜ MUA nào trong đơn"}
          </CardTitle>
        </CardHeader>
        {placeholders.length > 0 && (
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Máy tạm tạo khi lên đơn lúc kho hết hàng. Mua/mượn được máy thì vào Thiết bị nhập serial thật cho máy
              tạm (ghi chú CHỜ MUA tự bỏ).
            </p>
            {placeholders.map((g) => (
              <div key={g.typeId} className="rounded-lg border p-3">
                <p className="font-semibold">
                  {g.typeName} <span className="text-sm font-normal text-red-600">— cần {g.count} máy</span>
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {g.lines.map((l) => (
                    <li key={l.instanceCode}>
                      <Link href={`/orders/${l.orderId}`} className="font-medium hover:underline">
                        {l.orderCode}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · nhận {l.start ? timeFmt.format(new Date(l.start)) : "—"} · kho {l.branchName} ·{" "}
                        <span className="font-mono text-xs">{l.instanceCode}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
