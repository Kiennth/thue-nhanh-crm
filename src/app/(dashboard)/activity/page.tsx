import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ACTIVITY_ACTION_LABELS, ACTIVITY_TABLE_LABELS, getActivityRecordLabel } from "@/lib/activity-labels";
import { ActivityTableFilter } from "./activity-table-filter";

const PAGE_SIZE = 50;
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

const ACTION_BADGE_VARIANT: Record<"insert" | "update" | "delete", "default" | "secondary" | "destructive"> = {
  insert: "default",
  update: "secondary",
  delete: "destructive",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; page?: string }>;
}) {
  await requireRole(["admin", "ke_toan"]);

  const { table, page: pageParam } = await searchParams;
  const activeTable = table && table !== "all" ? table : "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const { count: totalCount } = await (() => {
    let q = supabase.from("activity_log").select("id", { count: "exact", head: true });
    if (activeTable) q = q.eq("table_name", activeTable);
    return q;
  })();

  const safeTotalCount = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let dataQuery = supabase.from("activity_log").select("*");
  if (activeTable) dataQuery = dataQuery.eq("table_name", activeTable);
  const { data: entries } = await dataQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const entryList = entries ?? [];

  const actorIds = [...new Set(entryList.map((e) => e.actor_id).filter((id): id is string => !!id))];
  const { data: actors } =
    actorIds.length > 0 ? await supabase.from("employees").select("id, name").in("id", actorIds) : { data: [] };
  const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nhật ký hoạt động</h1>
        <p className="text-sm text-muted-foreground">
          Ghi lại toàn bộ thay đổi (tạo mới/cập nhật/xoá) trên các bảng nghiệp vụ chính.
        </p>
      </div>

      <div className="space-y-3">
        <ActivityTableFilter value={activeTable || "all"} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Hành động</TableHead>
              <TableHead>Đối tượng</TableHead>
              <TableHead>Người thực hiện</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entryList.map((entry) => {
              const recordLabel = getActivityRecordLabel(entry.table_name, entry.new_data ?? entry.old_data);
              return (
                <TableRow key={entry.id}>
                  <TableCell>{dateFormatter.format(new Date(entry.created_at))}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_BADGE_VARIANT[entry.action]}>
                      {ACTIVITY_ACTION_LABELS[entry.action]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ACTIVITY_TABLE_LABELS[entry.table_name] ?? entry.table_name}
                    {recordLabel && <span className="text-muted-foreground"> · {recordLabel}</span>}
                  </TableCell>
                  <TableCell>{entry.actor_id ? (actorNameById.get(entry.actor_id) ?? "—") : "—"}</TableCell>
                </TableRow>
              );
            })}
            {!entryList.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Chưa có hoạt động nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <PaginationControls page={page} totalPages={totalPages} totalCount={safeTotalCount} itemLabel="hoạt động" />
      </div>
    </div>
  );
}
