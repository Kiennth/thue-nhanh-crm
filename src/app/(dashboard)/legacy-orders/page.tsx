import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchInput } from "@/components/search-input";
import { PaginationControls } from "@/components/pagination-controls";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;
const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export default async function LegacyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { search, page: pageParam } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const searchFilter = `customer_name_raw.ilike.%${activeSearch}%,customer_phone_raw.ilike.%${activeSearch}%,old_order_code.ilike.%${activeSearch}%`;

  const { count: totalCount } = await (() => {
    let q = supabase.from("legacy_orders").select("id", { count: "exact", head: true });
    if (activeSearch) q = q.or(searchFilter);
    return q;
  })();

  const safeTotalCount = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let dataQuery = supabase.from("legacy_orders").select("*");
  if (activeSearch) dataQuery = dataQuery.or(searchFilter);
  const { data: legacyOrders } = await dataQuery
    .order("order_date", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const legacyOrderList = legacyOrders ?? [];

  const matchedCustomerIds = [...new Set(legacyOrderList.map((o) => o.customer_id).filter((id) => id !== null))];
  const { data: matchedCustomers } =
    matchedCustomerIds.length > 0
      ? await supabase.from("customers").select("id, name").in("id", matchedCustomerIds)
      : { data: [] };
  const customerNameById = new Map((matchedCustomers ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Đơn hàng cũ (CRM cũ)</h1>
        <p className="text-sm text-muted-foreground">
          Dữ liệu tham chiếu import từ CRM cũ, không tính vào khoán hay các khâu xử lý đơn hàng.
        </p>
      </div>

      <div className="space-y-3">
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm theo tên khách, số điện thoại, mã đơn cũ..."
          value={activeSearch}
          resetParams={["page"]}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Mã đơn cũ</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Chi nhánh</TableHead>
              <TableHead>Doanh số</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {legacyOrderList.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{dateFormatter.format(new Date(order.order_date))}</TableCell>
                <TableCell>{order.old_order_code ?? "—"}</TableCell>
                <TableCell>
                  {order.customer_id && customerNameById.has(order.customer_id) ? (
                    customerNameById.get(order.customer_id)
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{order.customer_name_raw}</span>
                      <Badge variant="outline">Chưa khớp KH</Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell>{order.branch_name ?? "—"}</TableCell>
                <TableCell>{currencyFormatter.format(order.total_value)}đ</TableCell>
                <TableCell className="max-w-60 truncate">{order.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!legacyOrderList.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {activeSearch ? "Không tìm thấy đơn hàng nào." : "Chưa có dữ liệu đơn hàng cũ."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <PaginationControls page={page} totalPages={totalPages} totalCount={safeTotalCount} itemLabel="đơn hàng" />
      </div>
    </div>
  );
}
