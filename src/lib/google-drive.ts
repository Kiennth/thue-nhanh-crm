import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Bảng mới chưa có trong types/database.ts (file đó có WIP phiên khác) —
// truy vấn qua client không ràng kiểu. Bảng chỉ service role đọc/ghi được.
function untypedAdmin() {
  return createAdminClient() as unknown as SupabaseClient;
}

// Google Drive cho chứng từ (CEO 2026-10-04): chứng từ in → Google Docs sửa
// được, lưu trong thư mục "CRM Báo Giá & Hợp đồng" ở Drive của ceo@thuenhanh.vn.
// OAuth 1 lần (CEO bấm "Kết nối Google Drive"), quyền drive.file = CRM chỉ
// thấy/sửa file do chính nó tạo. Gọi REST thẳng (fetch) — không kéo thư viện
// googleapis vào Worker.
//
// Cần GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (OAuth client loại "Web
// application" trong Google Cloud, redirect URI .../api/google/callback).

export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
// Tên thư mục + người được chia sẻ quyền sửa (CEO 2026-10-04).
const FOLDER_NAME = "CRM Báo Giá & Hợp đồng";
const SHARE_WITH = ["ketoan@thuenhanh.vn", "admin@thuenhanh.vn", "hoapham@thuenhanh.vn"];

export function googleClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function getDriveIntegration() {
  const { data } = await untypedAdmin()
    .from("google_integration")
    .select("account_email, refresh_token, folder_id")
    .eq("id", "drive")
    .maybeSingle();
  return data as { account_email: string | null; refresh_token: string; folder_id: string | null } | null;
}

export async function saveDriveIntegration(row: {
  account_email: string | null;
  refresh_token: string;
  folder_id: string | null;
  connected_by: string;
}) {
  const { error } = await untypedAdmin()
    .from("google_integration")
    .upsert({ id: "drive", ...row, updated_at: new Date().toISOString() });
  if (error) throw new Error("Không lưu được kết nối Google: " + error.message);
}

export async function exchangeCode(code: string, redirectUri: string) {
  const cfg = googleClientConfig();
  if (!cfg) throw new Error("Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error("Google từ chối mã đăng nhập: " + (j.error ?? res.status));
  let email: string | null = null;
  if (j.id_token) {
    try {
      const payload = JSON.parse(atob(j.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      email = payload.email ?? null;
    } catch {
      email = null;
    }
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, email };
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const cfg = googleClientConfig();
  if (!cfg) throw new Error("Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(
      j.error === "invalid_grant"
        ? "Kết nối Google Drive đã hết hạn — Giám đốc bấm \"Kết nối Google Drive\" lại."
        : "Không lấy được quyền Google Drive: " + (j.error ?? res.status),
    );
  }
  return j.access_token;
}

export async function createFolder(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const j = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !j.id) throw new Error("Không tạo được thư mục trên Drive: " + (j.error?.message ?? res.status));
  await shareFolder(accessToken, j.id);
  return j.id;
}

// Chia sẻ quyền sửa thư mục cho kế toán/admin/nhân viên (file bên trong tự
// thừa hưởng). Lỗi 1 người không chặn cả việc tạo thư mục.
async function shareFolder(accessToken: string, folderId: string) {
  for (const emailAddress of SHARE_WITH) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?sendNotificationEmail=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role: "writer", emailAddress }),
      },
    ).catch(() => {});
  }
}

// Tải HTML lên, Google tự chuyển thành Google Docs sửa được.
export async function uploadHtmlAsGoogleDoc(
  accessToken: string,
  name: string,
  html: string,
  folderId: string | null,
): Promise<{ id: string; url: string }> {
  const boundary = `tn-${crypto.randomUUID()}`;
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.document",
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const j = (await res.json()) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !j.id) throw new Error("Không tạo được Google Docs: " + (j.error?.message ?? res.status));
  return { id: j.id, url: j.webViewLink ?? `https://docs.google.com/document/d/${j.id}/edit` };
}

// Ghi đè nội dung file Google Docs cũ (nút "Tạo lại từ dữ liệu mới").
export async function replaceGoogleDocContent(accessToken: string, fileId: string, html: string) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "text/html; charset=UTF-8" },
    body: html,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error("Không cập nhật được Google Docs: " + (j.error?.message ?? res.status));
  }
}

// File còn tồn tại (chưa bị xoá/chuyển vào thùng rác) trên Drive?
export async function googleFileAlive(accessToken: string, fileId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return false;
  const j = (await res.json()) as { trashed?: boolean };
  return !j.trashed;
}

export async function getOrderGoogleDoc(orderId: string, docType: string) {
  const { data } = await untypedAdmin()
    .from("order_google_docs")
    .select("file_id, url")
    .eq("order_id", orderId)
    .eq("doc_type", docType)
    .maybeSingle();
  return data as { file_id: string; url: string } | null;
}

export async function saveOrderGoogleDoc(row: {
  order_id: string;
  doc_type: string;
  file_id: string;
  url: string;
  created_by: string;
}) {
  const { error } = await untypedAdmin()
    .from("order_google_docs")
    .upsert({ ...row, updated_at: new Date().toISOString() });
  if (error) throw new Error("Không lưu được link Google Docs: " + error.message);
}
