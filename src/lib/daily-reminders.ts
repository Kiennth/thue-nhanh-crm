import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAgenda, type AgendaItem } from "@/lib/calendar-data";
import { loadShortages, type ShortageItem } from "@/lib/shortage";
import { vnStartOfDay, vnTodayString } from "@/lib/vn-time";

// Email nhắc việc 17h mỗi ngày (CEO 2026-10-04): lịch giao + thu hồi NGÀY
// MAI, đơn quá hạn chưa thu hồi, mã sắp thiếu 2 ngày tới — 1 bản gộp mọi kho
// gửi Giám đốc (CEO không muốn gửi cho nhân viên). Không gửi cho khách.

const SITE = "https://crm.thuenhanh.vn";
const DAY_MS = 86_400_000;
const SUMMARY_ROLES = ["giam_doc"];

export interface OverdueOrder {
  id: string;
  code: string;
  customer: string;
  phone: string | null;
  end: string;
  branchId: string;
}

export interface BranchDigest {
  branchId: string | null; // null = bản gộp cho quản lý
  title: string;
  recipients: { name: string; email: string }[];
  deliveries: AgendaItem[];
  returns: AgendaItem[];
  overdue: OverdueOrder[];
  shortages: ShortageItem[];
  subject: string;
  html: string;
  empty: boolean;
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const hourFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const dayFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function buildDailyReminders(db: SupabaseClient): Promise<BranchDigest[]> {
  const tomorrow = addDays(vnTodayString(), 1);
  const from = vnStartOfDay(tomorrow).toISOString();
  const to = vnStartOfDay(addDays(tomorrow, 1)).toISOString();
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const [{ data: branches }, { data: employees }, agenda, overdueRes, shortages] = await Promise.all([
    db.from("branches").select("id, name").eq("is_active", true).order("sort_order"),
    db.from("employees").select("name, email, role, branch_id").eq("is_active", true),
    loadAgenda(from, to, null, db),
    db
      .from("orders")
      .select("id, order_code, rental_end_at, return_branch_id, customers(name, phone)")
      .is("cancelled_at", null)
      .is("completed_at", null)
      .not("delivery_stock_moved_at", "is", null)
      .lt("rental_end_at", nowIso)
      .order("rental_end_at")
      .limit(500),
    loadShortages(2, null, db),
  ]);

  const overdue: OverdueOrder[] = (
    (overdueRes.data ?? []) as unknown as {
      id: string;
      order_code: string;
      rental_end_at: string;
      return_branch_id: string;
      customers: { name: string; phone: string | null } | null;
    }[]
  ).map((o) => ({
    id: o.id,
    code: o.order_code,
    customer: o.customers?.name ?? "—",
    phone: o.customers?.phone ?? null,
    end: o.rental_end_at,
    branchId: o.return_branch_id,
  }));
  const upcomingShortages = shortages.filter((s) => !s.shortNow);
  const branchList = (branches ?? []) as { id: string; name: string }[];
  const staff = ((employees ?? []) as { name: string; email: string | null; role: string; branch_id: string | null }[]).filter(
    (e) => e.email,
  );

  const make = (branchId: string | null, title: string, recipients: { name: string; email: string }[]) => {
    const inBranch = <T extends { branchId: string }>(list: T[]) =>
      branchId ? list.filter((x) => x.branchId === branchId) : list;
    const deliveries = inBranch(agenda.filter((a) => a.kind === "delivery"));
    const returns = inBranch(agenda.filter((a) => a.kind === "return"));
    const od = inBranch(overdue);
    const sh = inBranch(upcomingShortages);
    const empty = !deliveries.length && !returns.length && !od.length && !sh.length;
    const subject = `[Thuê Nhanh] ${title} — ngày mai ${dayFmt.format(new Date(from))}: ${deliveries.length} giao · ${returns.length} thu hồi${
      od.length ? ` · ${od.length} quá hạn` : ""
    }`;
    return {
      branchId,
      title,
      recipients,
      deliveries,
      returns,
      overdue: od,
      shortages: sh,
      subject,
      empty,
      html: renderHtml({ title, day: from, deliveries, returns, overdue: od, shortages: sh, branchNames: new Map(branchList.map((b) => [b.id, b.name])), showBranch: !branchId }),
    } satisfies BranchDigest;
  };

  // CEO 2026-10-04: KHÔNG gửi cho nhân viên — chỉ 1 bản gộp mọi kho cho
  // Giám đốc.
  const digests: BranchDigest[] = [
    make(
      null,
      "Tất cả kho",
      staff.filter((e) => SUMMARY_ROLES.includes(e.role)).map((e) => ({ name: e.name, email: e.email! })),
    ),
  ];
  return digests;
}

function renderHtml(d: {
  title: string;
  day: string;
  deliveries: AgendaItem[];
  returns: AgendaItem[];
  overdue: OverdueOrder[];
  shortages: ShortageItem[];
  branchNames: Map<string, string>;
  showBranch: boolean;
}): string {
  const td = 'style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px"';
  const how = (a: AgendaItem) =>
    a.transport === "bike"
      ? "Xe máy"
      : a.transport === "car"
        ? "Ô tô"
        : a.kind === "delivery"
          ? "Khách tự lấy"
          : "Khách tự trả";
  const agendaRows = (list: AgendaItem[]) =>
    list
      .map(
        (a) => `<tr>
  <td ${td}><b>${hourFmt.format(new Date(a.at))}</b></td>
  <td ${td}><a href="${SITE}/orders/${a.orderId}" style="color:#e11d48;font-weight:600">${esc(a.orderCode)}</a><br>${esc(a.customer)}${a.phone ? ` · ${esc(a.phone)}` : ""}${
    d.showBranch ? `<br><span style="color:#666">Kho ${esc(d.branchNames.get(a.branchId) ?? "")}</span>` : ""
  }</td>
  <td ${td}>${esc(a.items.join(", ") || "—")}${a.address ? `<br><span style="color:#666">📍 ${esc(a.address)}</span>` : ""}</td>
  <td ${td}>${how(a)}${a.done ? '<br><span style="color:#059669">✓ xong</span>' : ""}</td>
</tr>`,
      )
      .join("");
  const section = (title: string, color: string, body: string) =>
    `<h3 style="margin:24px 0 8px;font-size:16px;color:${color}">${title}</h3>${body}`;
  const table = (rows: string) =>
    `<table style="border-collapse:collapse;width:100%">${rows}</table>`;
  const none = '<p style="color:#888;margin:0">Không có.</p>';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;color:#17181c">
<h2 style="margin:0 0 4px">${esc(d.title)} — lịch ngày mai ${dayFmt.format(new Date(d.day))}</h2>
<p style="margin:0;color:#666">Email tự động lúc 17h từ CRM Thuê Nhanh.</p>
${section(`🚚 Giao hàng (${d.deliveries.length})`, "#2563eb", d.deliveries.length ? table(agendaRows(d.deliveries)) : none)}
${section(`↩️ Thu hồi (${d.returns.length})`, "#ea580c", d.returns.length ? table(agendaRows(d.returns)) : none)}
${
  d.overdue.length
    ? section(
        `⏰ Quá hạn chưa thu hồi (${d.overdue.length})`,
        "#dc2626",
        table(
          d.overdue
            .slice(0, 15)
            .map(
              (o) => `<tr><td ${td}><a href="${SITE}/orders/${o.id}" style="color:#e11d48;font-weight:600">${esc(o.code)}</a></td><td ${td}>${esc(o.customer)}${
                o.phone ? ` · ${esc(o.phone)}` : ""
              }</td><td ${td}>Hạn ${dayFmt.format(new Date(o.end))}${d.showBranch ? ` · Kho ${esc(d.branchNames.get(o.branchId) ?? "")}` : ""}</td></tr>`,
            )
            .join(""),
        ) + (d.overdue.length > 15 ? `<p style="margin:6px 0 0;color:#666">… và ${d.overdue.length - 15} đơn nữa.</p>` : ""),
      )
    : ""
}
${
  d.shortages.length
    ? section(
        `⚠️ Sắp thiếu hàng 2 ngày tới (${d.shortages.length})`,
        "#b45309",
        table(
          d.shortages
            .map(
              (s) => `<tr><td ${td}><b>${esc(s.typeName)}</b></td><td ${td}>Kho ${esc(s.branchName)}: có ${s.capacity}, cần ${s.peak} → <b style="color:#dc2626">thiếu ${s.missing}</b></td></tr>`,
            )
            .join(""),
        ) + `<p style="margin:6px 0 0"><a href="${SITE}/shortages?days=7">Xem chi tiết thiếu hàng →</a></p>`,
      )
    : ""
}
<p style="margin-top:24px"><a href="${SITE}/calendar?view=agenda" style="color:#e11d48">Mở lịch Giao / Thu hồi trên CRM →</a></p>
</div>`;
}
