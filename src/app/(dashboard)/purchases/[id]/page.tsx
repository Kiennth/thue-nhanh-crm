import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES, SUPPLIER_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { vnTodayString } from "@/lib/vn-time";
import { cn } from "@/lib/utils";
import { KIND_BADGE, PURCHASE_STATUS, statusLabel, type PurchaseKind, type PurchaseStatus } from "../purchase-labels";
import { PurchaseEditor, type EditorLine, type PickType } from "./purchase-editor";

// Chi tiết phiếu mua (CEO 2026-10-07) — xem actions/purchases.ts.
export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const { id } = await params;
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: po } = await db
    .from("purchase_orders")
    .select(
      "id, code, order_date, status, kind, supplier_invoice_no, note, received_at, supplier_id, branch_id, suppliers(name, phone, bank_account_number, bank_name, bank_account_holder), branches(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!po) notFound();
  const status = po.status as PurchaseStatus;
  const kind = ((po.kind as string) ?? "new") as PurchaseKind;
  const editable = status === "draft" || status === "ordered";

  const [{ data: lines }, { data: payments }, { data: suppliers }, { data: branches }, { data: received }] = await Promise.all([
    db
      .from("purchase_order_lines")
      .select(
        "id, equipment_type_id, equipment_unit_id, quantity, unit_cost, serials, warranty_expires_on, note, position, equipment_types(name, tracking_type), equipment_units(brand_model)",
      )
      .eq("purchase_order_id", id)
      .order("position")
      .order("created_at"),
    db
      .from("supplier_payments")
      .select("id, amount, paid_on, method, note, created_at")
      .eq("purchase_order_id", id)
      .order("paid_on"),
    db.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    db.from("branches").select("id, name").order("name"),
    status === "received"
      ? db
          .from("equipment_instances")
          .select("id, identifier_code, equipment_type_id")
          .eq("purchase_order_id", id)
          .order("identifier_code")
      : Promise.resolve({ data: [] as { id: string; identifier_code: string; equipment_type_id: string }[] }),
  ]);

  // Danh sách mã hàng để thêm dòng (chỉ khi còn sửa được): hàng cho thuê / bán,
  // theo serial hoặc số lượng (combo/dịch vụ không nhập kho).
  const types: PickType[] = editable
    ? (
        await fetchAllRows<{
          id: string;
          name: string;
          tracking_type: string;
          product_type: string;
          equipment_units: { id: string; brand_model: string }[];
        }>((from, to) =>
          db
            .from("equipment_types")
            .select("id, name, tracking_type, product_type, equipment_units(id, brand_model)")
            .in("product_type", ["rental", "sale"])
            .in("tracking_type", ["individual", "quantity"])
            .order("name")
            .range(from, to),
        )
      ).map((t) => ({
        key: t.id,
        label: t.name,
        tracking: t.tracking_type as "individual" | "quantity",
        units: (t.equipment_units ?? []).map((u) => ({ id: u.id, name: u.brand_model })),
      }))
    : [];
  // Biến thể của các mã đang có trong phiếu (khi phiếu khoá vẫn cần tên).
  const lineTypeIds = [...new Set((lines ?? []).map((l) => l.equipment_type_id as string))];
  const { data: lineUnits } = lineTypeIds.length
    ? await db.from("equipment_units").select("id, brand_model, equipment_type_id").in("equipment_type_id", lineTypeIds)
    : { data: [] };

  const editorLines: EditorLine[] = (lines ?? []).map((l) => {
    const t = l.equipment_types as unknown as { name: string; tracking_type: string } | null;
    return {
      id: l.id as string,
      typeId: l.equipment_type_id as string,
      typeName: t?.name ?? "",
      tracking: (t?.tracking_type ?? "quantity") as "individual" | "quantity",
      unitId: (l.equipment_unit_id as string | null) ?? null,
      units: (lineUnits ?? [])
        .filter((u) => u.equipment_type_id === l.equipment_type_id)
        .map((u) => ({ id: u.id as string, name: u.brand_model as string })),
      quantity: Number(l.quantity),
      unitCost: Number(l.unit_cost),
      serials: (l.serials as string[]) ?? [],
      warranty: (l.warranty_expires_on as string | null) ?? null,
      note: (l.note as string | null) ?? "",
    };
  });
  const supplier = po.suppliers as unknown as {
    name: string;
    phone: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    bank_account_holder: string | null;
  } | null;
  const branch = po.branches as unknown as { name: string } | null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/purchases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Mua hàng
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Phiếu mua {po.code as string}</h1>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PURCHASE_STATUS[status].className)}>
            {statusLabel(status, kind)}
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_BADGE[kind].className)}>
            {KIND_BADGE[kind].label}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {supplier?.name} · {kind === "new" ? "nhập về kho" : "kho ghi sổ"} {branch?.name}
          {po.received_at &&
            ` · nhập kho lúc ${new Date(po.received_at as string).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`}
        </p>
      </div>

      <PurchaseEditor
        po={{
          id: po.id as string,
          code: po.code as string,
          status,
          kind,
          supplierId: po.supplier_id as string,
          branchId: po.branch_id as string,
          orderDate: po.order_date as string,
          invoiceNo: (po.supplier_invoice_no as string | null) ?? "",
          note: (po.note as string | null) ?? "",
        }}
        supplier={supplier}
        lines={editorLines}
        types={types}
        payments={((payments ?? []) as { id: string; amount: number; paid_on: string; method: string; note: string | null }[]).map(
          (p) => ({ ...p, amount: Number(p.amount) }),
        )}
        suppliers={suppliers ?? []}
        branches={branches ?? []}
        lockBranch={employee.role === "cua_hang_truong"}
        canDelete={MANAGE_ROLES.includes(employee.role)}
        today={vnTodayString()}
        received={(received ?? []) as { id: string; identifier_code: string; equipment_type_id: string }[]}
      />
    </div>
  );
}
