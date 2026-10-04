import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { renderOrderDocumentPdf } from "@/lib/pdf";
import { PRINT_DOC_TYPES, printDocFileName, type PrintDocType } from "@/lib/print-docs";

// Nút "Tải PDF" trên trang chứng từ (CEO 2026-10-04: tách Tải PDF và In ra 2
// nút). Dựng PDF ở server bằng Chromium (cùng cách đính kèm email) rồi trả về
// dạng tải file, tên theo mẫu "BAO GIA PO <mã đơn>.pdf".
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole([...ALL_ROLES]);
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") ?? "contract";
  if (!(PRINT_DOC_TYPES as string[]).includes(type)) {
    return new Response("Loại chứng từ không hợp lệ.", { status: 400 });
  }
  const docType = type as PrintDocType;

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("order_code").eq("id", id).single();
  if (!order) return new Response("Không tìm thấy đơn hàng.", { status: 404 });

  try {
    const pdf = await renderOrderDocumentPdf(id, docType);
    const fileName = `${printDocFileName(docType, order.order_code)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response("Không thể xuất PDF: " + (e instanceof Error ? e.message : String(e)), { status: 500 });
  }
}
