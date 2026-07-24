import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CustomerDialog } from "./customer-dialog";
import { DeleteCustomerButton } from "./delete-customer-button";
import { CustomerReportSection } from "./customer-report-section";
import { LegacyOrdersSection } from "./legacy-orders-section";

const CUSTOMER_TYPE_LABELS = { individual: "Cá nhân", company: "Công ty" } as const;
const PAGE_SIZE = 50;

// Supabase/PostgREST giới hạn tối đa 1000 dòng mỗi lần gọi dù không truyền
// .range() — với 5800+ khách hàng, báo cáo cần TOÀN BỘ danh sách (không chỉ
// trang hiện tại) nên phải gọi nhiều lần .range() gộp lại.
async function fetchAllCustomersLite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const CHUNK = 1000;
  const all: { id: string; name: string; customer_type: "individual" | "company" }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, customer_type")
      .range(from, from + CHUNK - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; legacySearch?: string; legacyPage?: string }>;
}) {
  const { search, page: pageParam, legacySearch, legacyPage } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const searchFilter = `name.ilike.%${activeSearch}%,phone.ilike.%${activeSearch}%`;

  const [allCustomersLite, { data: orders }, { data: payments }, { count: totalCount }] =
    await Promise.all([
      fetchAllCustomersLite(supabase),
      supabase.from("orders").select("id, customer_id, total_value, order_date, cancelled_at"),
      supabase.from("order_payments").select("order_id, amount"),
      (() => {
        let q = supabase.from("customers").select("id", { count: "exact", head: true });
        if (activeSearch) q = q.or(searchFilter);
        return q;
      })(),
    ]);

  const safeTotalCount = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let dataQuery = supabase.from("customers").select("*");
  if (activeSearch) dataQuery = dataQuery.or(searchFilter);
  const { data: customers } = await dataQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const customerList = customers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <CustomerDialog
          trigger={
            <Button>
              <Plus className="size-4" />
              Thêm khách hàng
            </Button>
          }
        />
      </div>

      <CustomerReportSection
        customers={allCustomersLite ?? []}
        orders={orders ?? []}
        payments={payments ?? []}
      />

      <div className="space-y-3">
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm theo tên, số điện thoại..."
          value={activeSearch}
          resetParams={["page"]}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customerList.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${customer.id}`} className="hover:underline">
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</Badge>
                </TableCell>
                <TableCell>{customer.phone ?? "—"}</TableCell>
                <TableCell className="max-w-80 truncate">{customer.address ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CustomerDialog
                      customer={customer}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <Pencil className="size-4" />
                          <span className="sr-only">Sửa</span>
                        </Button>
                      }
                    />
                    <DeleteCustomerButton id={customer.id} name={customer.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!customerList.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {activeSearch ? "Không tìm thấy khách hàng nào." : "Chưa có khách hàng nào."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <PaginationControls page={page} totalPages={totalPages} totalCount={safeTotalCount} itemLabel="khách hàng" />
      </div>

      <LegacyOrdersSection search={legacySearch} page={legacyPage} />
    </div>
  );
}
