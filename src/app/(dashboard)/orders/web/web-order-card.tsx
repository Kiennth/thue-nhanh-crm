"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, ClipboardCheck, Mail, MapPin, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  updateWebOrderNote,
  updateWebOrderStatus,
  type WebOrderItem,
  type WebOrderStatus,
} from "@/lib/actions/website-orders";
import { QuickOrderDialog } from "../quick-order-dialog";

export interface WebOrderRow {
  id: string;
  code: string;
  customer_type: "individual" | "company";
  // Họ tên người liên hệ (form web v2, 09/10); công ty có thêm company_name.
  customer_name: string;
  company_name: string | null;
  phone: string;
  email: string | null;
  // Công ty: MST · khách lẻ: số CCCD (CEO: "CCCD chính là MST").
  tax_code: string;
  pickup_key: "hcm" | "hn" | "dn" | "ship";
  ship_city: "hcm" | "hn" | "dn" | null;
  address: string | null;
  rental_start_at: string;
  rental_end_at: string;
  items: WebOrderItem[];
  estimated_total: number;
  estimated_ship: number;
  estimated_deposit: number;
  note: string | null;
  status: WebOrderStatus;
  order_id: string | null;
  staff_note: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<WebOrderStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  converted: "Đã lên đơn",
  cancelled: "Đã huỷ",
};
const PLACE_LABEL: Record<string, string> = { hcm: "Kho TP HCM", hn: "Kho Hà Nội", dn: "Kho Đà Nẵng" };
const CITY_LABEL: Record<string, string> = { hcm: "TP HCM", hn: "Hà Nội", dn: "Đà Nẵng" };

const dt = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
const vnd = (n: number) => `${Math.round(Number(n)).toLocaleString("vi-VN")}đ`;

export function WebOrderCard({
  row,
  branches,
  branchId,
  matchedCustomer,
}: {
  row: WebOrderRow;
  branches: { id: string; name: string }[];
  branchId: string | null;
  matchedCustomer: { id: string; name: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(row.staff_note ?? "");
  const open = row.status === "new" || row.status === "contacted";

  function setStatus(status: WebOrderStatus) {
    startTransition(async () => {
      const r = await updateWebOrderStatus(row.id, status);
      if ("error" in r) toast.error(r.error);
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{row.code}</span>
        <Badge variant={row.status === "new" ? "destructive" : row.status === "converted" ? "default" : "outline"}>
          {STATUS_LABEL[row.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">gửi lúc {dt(row.created_at)}</span>
        {row.order_id && (
          <Link href={`/orders/${row.order_id}`} className="ml-auto text-sm font-medium text-primary hover:underline">
            Xem đơn CRM →
          </Link>
        )}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            {row.customer_type === "company" ? <Building2 className="size-4" /> : <User className="size-4" />}
            {row.company_name ?? row.customer_name}
            <span className="font-normal text-muted-foreground">
              · {row.customer_type === "company" ? "MST" : "CCCD"} {row.tax_code}
            </span>
          </p>
          {row.company_name && (
            <p className="flex items-center gap-1.5">
              <User className="size-4 text-muted-foreground" />
              Liên hệ: {row.customer_name}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Phone className="size-4 text-muted-foreground" />
            <a href={`tel:${row.phone}`} className="hover:underline">
              {row.phone}
            </a>
          </p>
          {row.email && (
            <p className="flex items-center gap-1.5">
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${row.email}`} className="hover:underline">
                {row.email}
              </a>
            </p>
          )}
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {row.pickup_key === "ship"
              ? `Giao tận nơi (${CITY_LABEL[row.ship_city ?? ""] ?? "?"}): ${row.address ?? ""}`
              : `Nhận tại ${PLACE_LABEL[row.pickup_key]}`}
          </p>
          <p>
            <span className="text-muted-foreground">Thuê:</span> {dt(row.rental_start_at)} → {dt(row.rental_end_at)}
          </p>
          {row.note && (
            <p className="rounded-md bg-muted/50 px-2 py-1">
              <span className="text-muted-foreground">Khách ghi chú:</span> {row.note}
            </p>
          )}
          {open && (
            <p className="text-xs text-muted-foreground">
              {matchedCustomer ? `Khách cũ trong CRM: ${matchedCustomer.name}` : "Chưa có trong CRM — tạo khách mới khi lên đơn."}
            </p>
          )}
        </div>

        <div className="text-sm">
          <ul className="divide-y rounded-md border">
            {row.items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  {it.name}
                  {it.variant_label && <span className="text-muted-foreground"> — {it.variant_label}</span>}
                </span>
                <span className="tabular-nums">×{it.quantity}</span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">{vnd(it.line_estimate)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-0.5 text-right text-xs text-muted-foreground">
            {Number(row.estimated_ship) > 0 && <p>Phí ship tạm tính: {vnd(row.estimated_ship)}</p>}
            {Number(row.estimated_deposit) > 0 && <p>Cọc tham khảo: {vnd(row.estimated_deposit)}</p>}
            <p className="text-sm font-semibold text-foreground">Web tạm tính: {vnd(row.estimated_total)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (row.staff_note ?? ""))
              startTransition(async () => {
                const r = await updateWebOrderNote(row.id, note);
                if ("error" in r) toast.error(r.error);
              });
          }}
          placeholder="Ghi chú nội bộ (đã gọi, khách hẹn…)"
          className="h-9 min-w-48 flex-1 rounded-md border bg-transparent px-2 text-sm"
        />
        {open && (
          <>
            {row.status === "new" && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus("contacted")}>
                Đã liên hệ
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStatus("cancelled")}>
              Huỷ đơn
            </Button>
            <QuickOrderDialog
              branches={branches}
              trigger={
                <Button size="sm">
                  <ClipboardCheck className="size-4" />
                  Lên đơn
                </Button>
              }
              prefill={{
                webOrderId: row.id,
                branchId,
                startAt: row.rental_start_at,
                endAt: row.rental_end_at,
                items: row.items.map((it) => ({
                  typeId: it.equipment_type_id,
                  unitId: it.unit_id,
                  quantity: it.quantity,
                })),
                ship: row.pickup_key === "ship",
                customer: matchedCustomer,
                ordererName: row.customer_name,
                ordererPhone: row.phone,
                ordererEmail: row.email ?? "",
                deliveryAddress: row.pickup_key === "ship" ? row.address : null,
              }}
            />
          </>
        )}
        {row.status === "cancelled" && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus("new")}>
            Mở lại
          </Button>
        )}
      </div>
    </div>
  );
}
