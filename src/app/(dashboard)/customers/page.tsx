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
import { createClient } from "@/lib/supabase/server";
import { CustomerDialog } from "./customer-dialog";
import { DeleteCustomerButton } from "./delete-customer-button";
import { CustomerReportSection } from "./customer-report-section";

const CUSTOMER_TYPE_LABELS = { individual: "Cá nhân", company: "Công ty" } as const;

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: orders }, { data: payments }] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("orders").select("id, customer_id, total_value, order_date, cancelled_at"),
    supabase.from("order_payments").select("order_id, amount"),
  ]);

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
        customers={customerList}
        orders={orders ?? []}
        payments={payments ?? []}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead>Điện thoại</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customerList.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell className="font-medium">{customer.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</Badge>
              </TableCell>
              <TableCell>{customer.phone ?? "—"}</TableCell>
              <TableCell>{customer.email ?? "—"}</TableCell>
              <TableCell className="max-w-64 truncate">{customer.notes ?? "—"}</TableCell>
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
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Chưa có khách hàng nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
