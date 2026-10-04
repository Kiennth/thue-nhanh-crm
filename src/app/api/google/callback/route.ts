import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import {
  createFolder,
  exchangeCode,
  getDriveIntegration,
  saveDriveIntegration,
} from "@/lib/google-drive";

// Google trả mã về đây sau khi CEO đồng ý → đổi lấy refresh token, tạo thư
// mục "Chứng từ CRM" (nếu chưa có), lưu lại rồi quay về trang đang dùng.
export async function GET(request: NextRequest) {
  const employee = await requireRole([...DIRECTOR_ONLY]);
  const params = request.nextUrl.searchParams;
  const returnTo = request.cookies.get("g_oauth_return")?.value ?? "/";
  const back = (status: string) => {
    const url = new URL(returnTo, request.nextUrl.origin);
    url.searchParams.set("google", status);
    const res = NextResponse.redirect(url);
    res.cookies.delete("g_oauth_state");
    res.cookies.delete("g_oauth_return");
    return res;
  };

  const code = params.get("code");
  if (params.get("error") || !code) return back("denied");
  if (!params.get("state") || params.get("state") !== request.cookies.get("g_oauth_state")?.value) {
    return back("invalid");
  }

  try {
    const { accessToken, refreshToken, email } = await exchangeCode(code, `${request.nextUrl.origin}/api/google/callback`);
    const existing = await getDriveIntegration();
    const token = refreshToken ?? existing?.refresh_token;
    if (!token) return back("no-refresh");
    const folderId = existing?.folder_id ?? (await createFolder(accessToken));
    await saveDriveIntegration({
      account_email: email,
      refresh_token: token,
      folder_id: folderId,
      connected_by: employee.id,
    });
    return back("connected");
  } catch {
    return back("error");
  }
}
