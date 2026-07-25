import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { CustomerDialog } from "../customer-dialog";
import { DeleteCustomerButton } from "../delete-customer-button";

const CUSTOMER_TYPE_LABELS = { individual: "Cá nhân", company: "Công ty" } as const;
const DEPOSIT_PERCENTAGE_LABELS: Record<number, string> = {
  100: "100% (mặc định)",
  50: "50%",
  0: "0% — khách thân thiết, miễn cọc",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <div className="flex items-center gap-2">
          <CustomerDialog
            customer={customer}
            trigger={
              <Button variant="outline">
                <Pencil className="size-4" />
                Sửa
              </Button>
            }
          />
          <DeleteCustomerButton id={customer.id} name={customer.name} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin khách hàng</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Loại khách hàng</p>
            <p className="font-medium">
              <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</Badge>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Điện thoại</p>
            <p className="font-medium">{customer.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{customer.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mã số thuế</p>
            <p className="font-medium">{customer.tax_code ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tiền cọc</p>
            <p className="font-medium">{DEPOSIT_PERCENTAGE_LABELS[customer.deposit_percentage]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Địa chỉ</p>
            <p className="font-medium">{customer.address ?? "—"}</p>
          </div>
          {customer.notes && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground">Ghi chú</p>
              <p className="font-medium">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
