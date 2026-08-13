import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Đánh dấu "đã thử lại một lần" khi thua cuộc đua refresh token — xem chú
// thích trong middleware. Tự hết hạn sau 5 giây.
const RETRY_MARKER_COOKIE = "tn-refresh-retried";

// Next.js 16 đổi tên "Middleware" thành "Proxy" (chức năng không đổi).
// Chỉ làm optimistic check + refresh session cookie ở đây — RLS ở Postgres
// mới là lớp bảo vệ dữ liệu thật sự.
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  // /auth/confirm tự xác thực token mời/khôi phục mật khẩu bên trong route
  // handler — chưa có session lúc proxy chạy nên phải cho qua trước.
  const isAuthConfirmRoute = request.nextUrl.pathname.startsWith("/auth/confirm");

  if (!user && !isLoginRoute && !isAuthConfirmRoute) {
    // Nhiều request song song cùng đem một refresh token đi gia hạn: thằng
    // thắng nhận token mới, các thằng thua dính "already used". Cho thua
    // redirect lại chính URL đang xem một lần — lúc quay lại trình duyệt đã
    // mang cookie mới của thằng thắng. Chỉ đá về /login khi thử lại vẫn hỏng
    // (phiên chết thật), cookie đánh dấu tự hết hạn sau 5 giây.
    const isRefreshRace =
      error?.code === "refresh_token_already_used" ||
      error?.message?.includes("Already Used");
    const alreadyRetried = request.cookies.has(RETRY_MARKER_COOKIE);
    if (isRefreshRace && !alreadyRetried) {
      const retryResponse = NextResponse.redirect(request.nextUrl);
      retryResponse.cookies.set(RETRY_MARKER_COOKIE, "1", { maxAge: 5, path: "/" });
      return retryResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const loginResponse = NextResponse.redirect(url);
    if (alreadyRetried) loginResponse.cookies.delete(RETRY_MARKER_COOKIE);
    // Phiên chết hẳn mà cookie sb-* vẫn nằm trong trình duyệt thì supabase
    // client phía browser sẽ cầm token chết gọi refresh lặp vô hạn → dính
    // rate limit 429 → đăng nhập lại cũng bị chặn (văng liên tục 2026-08-13).
    // Xoá sạch cookie phiên khi đá về /login để cắt vòng lặp đó.
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) loginResponse.cookies.delete(cookie.name);
    }
    return loginResponse;
  }

  if (user && request.cookies.has(RETRY_MARKER_COOKIE)) {
    supabaseResponse.cookies.delete(RETRY_MARKER_COOKIE);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
