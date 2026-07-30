"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { COMPANY_INFO } from "@/lib/company-info";
import { PRINT_DOC_TITLES, type PrintDocType } from "@/lib/print-docs";
import { renderOrderDocumentPdf } from "@/lib/pdf";
import { sendEmail } from "@/lib/email";

export type ActionState = { error: string } | { success: true } | undefined;

const PRINT_DOC_TYPE_OPTIONS = [
  "contract",
  "quote",
  "handover",
  "collection",
  "acceptance",
] as const;

const SendOrderDocumentEmailSchema = z.object({
  order_id: z.string().uuid(),
  doc_type: z.enum(PRINT_DOC_TYPE_OPTIONS),
  email: z.string().trim().email({ message: "Email không hợp lệ." }),
});

// Xuất chứng từ (hợp đồng/báo giá/biên bản) thành PDF rồi gửi thẳng cho khách
// qua email — tái dùng chính trang /orders/[id]/print đang có (render bằng
// Chromium headless, xem src/lib/pdf.ts) thay vì build lại layout PDF riêng.
export async function sendOrderDocumentEmail(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = SendOrderDocumentEmailSchema.safeParse({
    order_id: formData.get("order_id"),
    doc_type: formData.get("doc_type"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { order_id, doc_type, email } = parsed.data;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("order_code")
    .eq("id", order_id)
    .single();

  if (!order) {
    return { error: "Không tìm thấy đơn hàng." };
  }

  let pdf: Buffer;
  try {
    pdf = await renderOrderDocumentPdf(order_id, doc_type as PrintDocType);
  } catch (e) {
    return { error: "Không thể xuất PDF: " + (e instanceof Error ? e.message : String(e)) };
  }

  const docTitle = PRINT_DOC_TITLES[doc_type as PrintDocType];
  const { error } = await sendEmail({
    to: email,
    subject: `${docTitle} — Đơn #${order.order_code} — ${COMPANY_INFO.name}`,
    html: `
      <p>Kính gửi Quý khách,</p>
      <p>${COMPANY_INFO.name} xin gửi ${docTitle.toLowerCase()} cho đơn hàng <strong>#${order.order_code}</strong> đính kèm trong email này.</p>
      <p>Mọi thắc mắc vui lòng liên hệ ${COMPANY_INFO.phone} hoặc ${COMPANY_INFO.email}.</p>
      <p>Trân trọng,<br/>${COMPANY_INFO.name}</p>
    `,
    attachments: [
      {
        filename: `${docTitle} - ${order.order_code}.pdf`,
        content: pdf,
      },
    ],
  });

  if (error) {
    return { error };
  }

  return { success: true };
}
