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

// Hộp thư khách hỏi thuê từ form web new.thuenhanh.vn (bảng website_leads).
// Mỗi lead cũng đã gửi email về ceo@ lúc khách bấm gửi — đây là sổ lưu đầy đủ.
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
        <h1 className="text-2xl font-semibold">Khách hỏi thuê từ web</h1>
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
              <TableCell className="max-w-md text-sm">{lead.message ?? "—"}</TableCell>
              <TableCell className="text-sm">
                {lead.product_slug ? (
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
