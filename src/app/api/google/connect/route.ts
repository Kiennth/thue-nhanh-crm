import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import { GOOGLE_SCOPES, googleClientConfig } from "@/lib/google-drive";

// Giám đốc bấm "Kết nối Google Drive" → sang trang đồng ý của Google
// (đăng nhập ceo@thuenhanh.vn). Kết quả về /api/google/callback.
export async function GET(request: NextRequest) {
  await requireRole([...DIRECTOR_ONLY]);
  const cfg = googleClientConfig();
  const origin = request.nextUrl.origin;
  if (!cfg) {
    return NextResponse.json(
      { error: "Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trên CRM." },
      { status: 500 },
    );
  }
  const state = crypto.randomUUID();
  const returnTo = request.nextUrl.searchParams.get("return") ?? "/";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    login_hint: "ceo@thuenhanh.vn",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_oauth_state", state, cookieOpts);
  res.cookies.set("g_oauth_return", returnTo.startsWith("/") ? returnTo : "/", cookieOpts);
  return res;
}
