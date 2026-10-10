import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Building2, CircleDollarSign, PackagePlus, UserRound, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchInput } from "@/components/search-input";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES, SUPPLIER_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { SupplierDialog, type Supplier } from "./supplier-dialog";
import { CopyBankButton, DeleteSupplierButton } from "./supplier-row-actions";

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Nhà cung cấp (CEO 2026-10-07) — danh bạ nơi mua máy / phụ kiện / dịch vụ,
// kèm thông tin chuyển khoản. Xem migration 20261007140000_suppliers.sql.
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; show?: string }>;
}) {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const { q, type, show } = await searchParams;
  const query = q?.trim() ?? "";
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data }, { data: totals }, { data: pos }] = await Promise.all([
    db.from("suppliers").select("*").order("name").limit(2000),
    db.from("purchase_order_totals").select("purchase_order_id, supplier_id, total, paid"),
    db.from("purchase_orders").select("id, status"),
  ]);
  // Tổng đã mua / còn nợ theo NCC (bỏ phiếu huỷ).
  const cancelled = new Set(((pos ?? []) as { id: string; status: string }[]).filter((p) => p.status === "cancelled").map((p) => p.id));
  const bySupplier = new Map<string, { bought: number; owed: number; count: number }>();
  for (const t of (totals ?? []) as { purchase_order_id: string; supplier_id: string; total: number; paid: number }[]) {
    if (cancelled.has(t.purchase_order_id)) continue;
    const cur = bySupplier.get(t.supplier_id) ?? { bought: 0, owed: 0, count: 0 };
    cur.bought += Number(t.total);
    cur.owed += Math.max(Number(t.total) - Number(t.paid), 0);
    cur.count += 1;
    bySupplier.set(t.supplier_id, cur);
  }
  const money = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n)) + "đ";
  const all = (data ?? []) as Supplier[];
  const needle = fold(query);
  const digits = query.replace(/\D/g, "");
  const rows = all.filter((s) => {
    if (show !== "all" && !s.is_active) return false;
    if (type === "company" || type === "individual") {
      if (s.supplier_type !== type) return false;
    }
    if (!query) return true;
    const hay = fold([s.name, s.contact_name, s.email, s.address, s.tax_code, s.products, s.notes, s.bank_account_holder].join(" "));
    return (
      hay.includes(needle) ||
      (digits.length >= 3 && [s.phone, s.bank_account_number, s.tax_code].some((v) => (v ?? "").replace(/\D/g, "").includes(digits)))
    );
  });
  const inactiveCount = all.filter((s) => !s.is_active).length;
  const canDelete = MANAGE_ROLES.includes(employee.role);
  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const next = { q: query || undefined, type, show, ...p };
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/suppliers?${s}` : "/suppliers";
  };
  const chip = (active: boolean, tone: "all" | "company" | "individual" | "muted" = "all") => {
    const on = {
      all: "border-primary bg-primary text-primary-foreground",
      company: "border-sky-600 bg-sky-600 text-white",
      individual: "border-amber-500 bg-amber-500 text-white",
      muted: "border-slate-500 bg-slate-500 text-white",
    }[tone];
    const off = {
      all: "hover:border-primary hover:text-primary",
      company: "border-sky-300 text-sky-800 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40",
      individual: "border-amber-300 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40",
      muted: "text-muted-foreground hover:border-slate-400",
    }[tone];
    return `rounded-full border px-3 py-1 text-sm font-medium transition ${active ? on : off}`;
  };
  const activeAll = all.filter((s) => s.is_active);
  const totalOwed = [...bySupplier.values()].reduce((s, v) => s + v.owed, 0);
  const totalBought = [...bySupplier.values()].reduce((s, v) => s + v.bought, 0);
  const cards = [
    { icon: Users, label: "Đang hợp tác", value: `${activeAll.length} NCC`, sub: `${activeAll.filter((s) => s.supplier_type === "company").length} công ty · ${activeAll.filter((s) => s.supplier_type === "individual").length} cá nhân`, tone: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200", href: "/suppliers" },
    { icon: PackagePlus, label: "Đã mua (tất cả phiếu)", value: money(totalBought), tone: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200", href: "/purchases" },
    { icon: CircleDollarSign, label: "Còn nợ NCC", value: money(totalOwed), tone: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200", href: "/purchases?debt=1" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Nhà cung cấp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nơi mua máy, phụ kiện, dịch vụ sửa chữa — kèm thông tin chuyển khoản. Tìm theo tên, mặt hàng, SĐT, số tài khoản,
            MST.
          </p>
        </div>
        <SupplierDialog />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={`rounded-xl border p-3 transition hover:shadow-sm ${c.tone}`}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
              <c.icon className="size-4" /> {c.label}
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums">{c.value}</p>
            {c.sub && <p className="text-xs opacity-75">{c.sub}</p>}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput paramName="q" placeholder="Tìm tên, mặt hàng, SĐT, STK…" value={query} />
        <Link href={href({ type: undefined })} className={chip(!type)}>
          Tất cả
        </Link>
        <Link href={href({ type: "company" })} className={chip(type === "company", "company")}>
          Công ty
        </Link>
        <Link href={href({ type: "individual" })} className={chip(type === "individual", "individual")}>
          Cá nhân
        </Link>
        {inactiveCount > 0 && (
          <Link href={href({ show: show === "all" ? undefined : "all" })} className={chip(show === "all", "muted")}>
            Gồm cả ngừng hợp tác ({inactiveCount})
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {all.length === 0 ? "Chưa có nhà cung cấp nào — bấm “Thêm nhà cung cấp” để bắt đầu." : "Không có nhà cung cấp khớp bộ lọc."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>Liên hệ</TableHead>
                <TableHead>MST / CCCD</TableHead>
                <TableHead>Chuyển khoản</TableHead>
                <TableHead>Mặt hàng</TableHead>
                <TableHead className="text-right">Đã mua</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const bank = [s.bank_account_number, s.bank_name, s.bank_account_holder].filter(Boolean).join(" · ");
                return (
                  <TableRow key={s.id} className={s.is_active ? "" : "opacity-55"}>
                    <TableCell className={`border-l-4 align-top ${s.supplier_type === "company" ? "border-l-sky-500" : "border-l-amber-500"}`}>
                      <div className="flex items-start gap-2">
                        {s.supplier_type === "company" ? (
                          <Building2 className="mt-0.5 size-4 shrink-0 text-sky-600" />
                        ) : (
                          <UserRound className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        )}
                        <div>
                          <p className="font-semibold">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.supplier_type === "company" ? "Công ty" : "Cá nhân"}
                            {!s.is_active && " · ngừng hợp tác"}
                          </p>
                          {s.address && <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{s.address}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {s.contact_name && <p>{s.contact_name}</p>}
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="font-medium hover:underline">
                          {s.phone}
                        </a>
                      )}
                      {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                    </TableCell>
                    <TableCell className="align-top text-sm tabular-nums">{s.tax_code}</TableCell>
                    <TableCell className="align-top text-sm">
                      {bank ? (
                        <div className="flex items-start gap-1">
                          <div>
                            <p className="font-medium tabular-nums">{s.bank_account_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {[s.bank_name, s.bank_account_holder].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <CopyBankButton text={bank} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 align-top text-sm">
                      {s.products}
                      {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums">
                      {bySupplier.get(s.id) ? (
                        <Link href={`/purchases?supplier=${s.id}`} className="hover:underline">
                          <p className="font-medium">{money(bySupplier.get(s.id)!.bought)}</p>
                          <p className="text-xs text-muted-foreground">{bySupplier.get(s.id)!.count} phiếu</p>
                          {bySupplier.get(s.id)!.owed > 0 && (
                            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">nợ {money(bySupplier.get(s.id)!.owed)}</p>
                          )}
                        </Link>
                      ) : (
                        <Link href={`/purchases?supplier=${s.id}`} className="text-xs text-muted-foreground hover:underline">
                          Chưa có phiếu
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center justify-end">
                        <Link
                          href={`/purchases?supplier=${s.id}`}
                          className="mr-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Phiếu mua
                        </Link>
                        <SupplierDialog supplier={s} />
                        {canDelete && <DeleteSupplierButton id={s.id} name={s.name} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
