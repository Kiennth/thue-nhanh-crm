import Link from "next/link";
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

const PAGE_SIZE = 20;
const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

// Danh sách đơn hàng cũ (import từ CRM cũ, chỉ để tham chiếu — xem chi tiết
// ở AGENTS.md phần lịch sử). Dùng chung cho trang /customers (toàn bộ, có
// tìm kiếm + phân trang riêng, param "legacySearch"/"legacyPage" để không
// đụng param "search"/"page" của bảng khách hàng) và trang /customers/[id]
// (chỉ của 1 khách, không cần tìm kiếm/phân trang).
export async function LegacyOrdersSection({
  customerId,
  search,
  page: pageParam,
}: {
  customerId?: string;
  search?: string;
  page?: string;
}) {
  const supabase = await createClient();

  if (customerId) {
    const { data: legacyOrders } = await supabase
      .from("legacy_orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("order_date", { ascending: false });

    return (
      <LegacyOrdersTable orders={legacyOrders ?? []} customerNameById={new Map()} showCustomerColumn={false} />
    );
  }

  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);
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
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Đơn hàng cũ (CRM cũ)</h2>
        <p className="text-sm text-muted-foreground">
          Dữ liệu tham chiếu import từ CRM cũ, không tính vào khoán hay các khâu xử lý đơn hàng.
        </p>
      </div>

      <SearchInput
        key={activeSearch}
        paramName="legacySearch"
        placeholder="Tìm theo tên khách, số điện thoại, mã đơn cũ..."
        value={activeSearch}
        resetParams={["legacyPage"]}
      />

      <LegacyOrdersTable orders={legacyOrderList} customerNameById={customerNameById} />

      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalCount={safeTotalCount}
        itemLabel="đơn hàng"
        paramName="legacyPage"
      />
    </div>
  );
}

function LegacyOrdersTable({
  orders,
  customerNameById,
  showCustomerColumn = true,
}: {
  orders: {
    id: string;
    order_date: string;
    old_order_code: string | null;
    customer_id: string | null;
    customer_name_raw: string;
    branch_name: string | null;
    total_value: number;
    notes: string | null;
  }[];
  customerNameById: Map<string, string>;
  showCustomerColumn?: boolean;
}) {
  const colSpan = showCustomerColumn ? 6 : 5;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ngày</TableHead>
          <TableHead>Mã đơn cũ</TableHead>
          {showCustomerColumn && <TableHead>Khách hàng</TableHead>}
          <TableHead>Chi nhánh</TableHead>
          <TableHead>Doanh số</TableHead>
          <TableHead>Ghi chú</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>{dateFormatter.format(new Date(order.order_date))}</TableCell>
            <TableCell>{order.old_order_code ?? "—"}</TableCell>
            {showCustomerColumn && (
              <TableCell>
                {order.customer_id && customerNameById.has(order.customer_id) ? (
                  <Link href={`/customers/${order.customer_id}`} className="hover:underline">
                    {customerNameById.get(order.customer_id)}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>{order.customer_name_raw}</span>
                    <Badge variant="outline">Chưa khớp KH</Badge>
                  </div>
                )}
              </TableCell>
            )}
            <TableCell>{order.branch_name ?? "—"}</TableCell>
            <TableCell>{currencyFormatter.format(order.total_value)}đ</TableCell>
            <TableCell className="max-w-60 truncate">{order.notes ?? "—"}</TableCell>
          </TableRow>
        ))}
        {!orders.length && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
              Chưa có đơn hàng cũ nào.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
