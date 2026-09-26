import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { deleteWebsiteLead } from "@/lib/actions/website";
import { VN_TIME_ZONE } from "@/lib/date-format";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

const INTENT_LABELS: Record<string, string> = {
  buy: "Muốn mua",
  rent: "Muốn thuê",
  rent_to_buy: "Thuê thử rồi mua",
  advice: "Cần tư vấn",
};

// Tóm tắt cấu hình khách vừa tính trên trang tư vấn máy AI (details jsonb
// do web AICheck gửi) — chỉ đọc các khoá đã biết, khoá lạ bỏ qua.
function advisorSummary(details: Record<string, unknown> | null): string[] {
  if (!details) return [];
  const pick = (key: string) => {
    const value = details[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
  };
  const lines: string[] = [];
  const model = pick("model");
  if (model) {
    const quant = pick("quant");
    lines.push(`Model: ${model}${quant ? ` (${quant})` : ""}`);
  }
  const context = pick("context");
  const users = pick("users");
  if (context || users) {
    lines.push(
      [context && `ngữ cảnh ${context} token`, users && `${users} người dùng`]
        .filter(Boolean)
        .join(", "),
    );
  }
  const need = pick("memory_needed_gb");
  if (need) lines.push(`Cần ~${need} GB bộ nhớ`);
  const hardware = pick("hardware");
  if (hardware) {
    const tps = pick("est_tps");
    lines.push(`Máy chọn: ${hardware}${tps ? ` · ~${tps} token/s` : ""}`);
  }
  return lines;
}

// Hộp thư khách hỏi từ web: form new.thuenhanh.vn (source = website) và
// trang tư vấn máy chạy AI (source = advisor, kèm nhu cầu + cấu hình đã tính).
// Mỗi lead web cho thuê cũng đã gửi email về ceo@ — đây là sổ lưu đầy đủ.
export default async function WebsiteLeadsPage() {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("website_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = leads ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khách hỏi từ web</h1>
        <Link href="/website" className="text-sm font-medium text-primary hover:underline">
          ← Quản trị website
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Thời gian</TableHead>
            <TableHead>Khách</TableHead>
            <TableHead>Lời nhắn</TableHead>
            <TableHead className="w-40">Sản phẩm quan tâm</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="text-sm text-muted-foreground">
                {dateTimeFormatter.format(new Date(lead.created_at))}
              </TableCell>
              <TableCell>
                <p className="font-medium">{lead.name}</p>
                <div className="flex gap-2 text-sm">
                  <a className="text-primary hover:underline" href={`tel:${lead.phone}`}>
                    {lead.phone}
                  </a>
                  <a
                    className="text-primary hover:underline"
                    href={`https://zalo.me/${lead.phone.replace(/^0/, "84")}`}
                    target="_blank"
                    rel="noopener"
                  >
                    Zalo
                  </a>
                </div>
              </TableCell>
              <TableCell className="max-w-md text-sm">
                {lead.source === "advisor" && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                      Tư vấn máy AI
                    </span>
                    {lead.intent && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                        {INTENT_LABELS[lead.intent] ?? lead.intent}
                      </span>
                    )}
                  </div>
                )}
                <p>{lead.message ?? (lead.source === "advisor" ? "" : "—")}</p>
                {advisorSummary(lead.details).map((line) => (
                  <p key={line} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
              </TableCell>
              <TableCell className="text-sm">
                {lead.source === "advisor" ? (
                  lead.product_slug ?? "—"
                ) : lead.product_slug ? (
                  <a
                    className="text-primary hover:underline"
                    href={`https://new.thuenhanh.vn/${lead.product_slug}`}
                    target="_blank"
                    rel="noopener"
                  >
                    /{lead.product_slug}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <ConfirmDeleteButton
                  confirmMessage={`Xoá liên hệ của "${lead.name}"?`}
                  successMessage="Đã xoá."
                  action={deleteWebsiteLead}
                  actionArg={lead.id}
                />
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Chưa có khách nào gửi form từ web.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
