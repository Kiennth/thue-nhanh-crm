"use server";

import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { PRINT_DOC_TYPES, printDocFileName, type PrintDocType } from "@/lib/print-docs";
import { createClient } from "@/lib/supabase/server";
import { renderOrderDocumentHtml } from "@/lib/doc-html";
import {
  createFolder,
  getAccessToken,
  getDriveIntegration,
  getOrderGoogleDoc,
  googleFileAlive,
  replaceGoogleDocContent,
  saveDriveIntegration,
  saveOrderGoogleDoc,
  uploadHtmlAsGoogleDoc,
} from "@/lib/google-drive";

// "Mở bằng Google Docs" trên trang chứng từ (CEO 2026-10-04): lần đầu tạo
// file Google Docs trong thư mục "Chứng từ CRM" (Drive ceo@thuenhanh.vn),
// lần sau mở lại ĐÚNG file đó (giữ chỗ đã sửa tay); regenerate = ghi đè nội
// dung bằng dữ liệu đơn mới nhất.
export async function openInGoogleDocs(
  orderId: string,
  docType: string,
  regenerate = false,
): Promise<{ url: string } | { error: string }> {
  const employee = await requireRole([...MANAGE_ROLES]);
  if (!(PRINT_DOC_TYPES as string[]).includes(docType)) return { error: "Loại chứng từ không hợp lệ." };
  const type = docType as PrintDocType;

  try {
    const integration = await getDriveIntegration();
    if (!integration) return { error: "Chưa kết nối Google Drive — Giám đốc bấm \"Kết nối Google Drive\" trước." };

    const existing = await getOrderGoogleDoc(orderId, docType);
    const accessToken = await getAccessToken(integration.refresh_token);
    if (existing && !regenerate && (await googleFileAlive(accessToken, existing.file_id))) {
      return { url: existing.url };
    }

    const supabase = await createClient();
    const { data: order } = await supabase.from("orders").select("order_code").eq("id", orderId).single();
    if (!order) return { error: "Không tìm thấy đơn." };

    const html = await renderOrderDocumentHtml(orderId, type);
    if (existing && regenerate && (await googleFileAlive(accessToken, existing.file_id))) {
      await replaceGoogleDocContent(accessToken, existing.file_id, html);
      return { url: existing.url };
    }

    let folderId = integration.folder_id;
    if (!folderId) {
      folderId = await createFolder(accessToken);
      await saveDriveIntegration({ ...integration, folder_id: folderId, connected_by: employee.id });
    }
    const file = await uploadHtmlAsGoogleDoc(accessToken, printDocFileName(type, order.order_code), html, folderId);
    await saveOrderGoogleDoc({
      order_id: orderId,
      doc_type: docType,
      file_id: file.id,
      url: file.url,
      created_by: employee.id,
    });
    return { url: file.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không mở được Google Docs." };
  }
}
