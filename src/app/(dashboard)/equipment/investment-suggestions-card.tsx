import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const UTILIZATION_DAYS = 90;
// Ngưỡng gợi ý: >=70% là đang căng kho (tính cả thời gian trống giữa 2 lượt
// thuê thì 70% gần như kín lịch); <10% với kho >0 là vốn nằm chết.
const BUY_THRESHOLD = 70;
const DISPOSE_THRESHOLD = 10;
const TOP_N = 6;

// Gợi ý đầu tư theo tỉ lệ lấp đầy (CEO chọn làm 2026-08-09) — trả lời câu
// "nên mua thêm gì, nên thanh lý gì" bằng số liệu thuê thật 90 ngày qua.
// Chỉ Giám đốc/Kế toán (RPC cũng gate đúng tập này — người khác gọi ra rỗng).
export async function InvestmentSuggestionsCard() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("equipment_utilization", {
    p_days: UTILIZATION_DAYS,
  });
  if (error || !rows?.length) return null;

  const buyCandidates = rows
    .filter((r) => r.utilization_pct !== null && r.utilization_pct >= BUY_THRESHOLD)
    .slice(0, TOP_N);
  const disposeCandidates = rows
    .filter(
      (r) =>
        r.utilization_pct !== null && r.utilization_pct < DISPOSE_THRESHOLD && r.capacity > 0,
    )
    .sort((a, b) => (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0) || b.capacity - a.capacity)
    .slice(0, TOP_N);

  if (!buyCandidates.length && !disposeCandidates.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Gợi ý đầu tư — theo tỉ lệ lấp đầy {UTILIZATION_DAYS} ngày qua
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lấp đầy = số ngày-thiết-bị được thuê so với toàn bộ kho. Trên {BUY_THRESHOLD}% nghĩa là
          gần như kín lịch (nhiều khả năng đang phải từ chối khách); dưới {DISPOSE_THRESHOLD}% là
          vốn nằm im.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">📈 Nên mua thêm</p>
            {buyCandidates.length ? (
              <ul className="space-y-1.5 text-sm">
                {buyCandidates.map((r) => (
                  <li key={r.equipment_type_id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate" title={r.equipment_type_name}>
                      {r.equipment_type_name}
                      <span className="text-muted-foreground">
                        {" "}
                        · kho {r.capacity} · {r.orders_in_period} đơn
                      </span>
                    </span>
                    <Badge variant={(r.utilization_pct ?? 0) >= 100 ? "destructive" : "default"}>
                      {r.utilization_pct}%
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Không có loại hàng nào chạm ngưỡng {BUY_THRESHOLD}% — kho đang đủ đáp ứng.
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">📉 Cân nhắc thanh lý</p>
            {disposeCandidates.length ? (
              <ul className="space-y-1.5 text-sm">
                {disposeCandidates.map((r) => (
                  <li key={r.equipment_type_id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate" title={r.equipment_type_name}>
                      {r.equipment_type_name}
                      <span className="text-muted-foreground">
                        {" "}
                        · kho {r.capacity} · {r.orders_in_period} đơn
                      </span>
                    </span>
                    <Badge variant="outline">{r.utilization_pct}%</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Không có loại hàng nào nằm im.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
