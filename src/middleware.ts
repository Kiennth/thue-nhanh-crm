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
    // mang cookie mới của thằng thắng. Cookie đánh dấu tự hết hạn sau 5 giây.
    const isRefreshRace =
      error?.code === "refresh_token_already_used" ||
      error?.message?.includes("Already Used");
    // Lỗi TẠM THỜI (Supabase chặn tần suất 429, lỗi server 5xx, đứt mạng —
    // không có status): phiên trong trình duyệt nhiều khả năng vẫn SỐNG,
    // tuyệt đối không được xoá cookie — bản 2026-08-13 đầu ngày xoá cả với
    // 429 nên giết oan phiên khoẻ, người dùng văng dây chuyền mỗi lần IP
    // chạm rate limit (dev + production + nhiều tab chung 1 IP).
    const status = (error as { status?: number } | null)?.status;
    const isTransient =
      !isRefreshRace && (status === undefined || status === 0 || status === 429 || status >= 500);
    // Không có cookie phiên nào (khách chưa đăng nhập) thì chẳng có gì để
    // thử lại hay dọn — về thẳng /login như xưa, khỏi tốn một vòng redirect.
    const hasSessionCookies = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    const alreadyRetried = request.cookies.has(RETRY_MARKER_COOKIE);
    if (hasSessionCookies && (isRefreshRace || isTransient) && !alreadyRetried) {
      const retryResponse = NextResponse.redirect(request.nextUrl);
      retryResponse.cookies.set(RETRY_MARKER_COOKIE, "1", { maxAge: 5, path: "/" });
      return retryResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const loginResponse = NextResponse.redirect(url);
    if (alreadyRetried) loginResponse.cookies.delete(RETRY_MARKER_COOKIE);
    // Token chết thật (400 invalid/already-used sau khi đã thử lại) mà cookie
    // sb-* vẫn nằm trong trình duyệt thì client sẽ cầm token chết gọi refresh
    // lặp vô hạn → tự gây rate limit → chặn cả đăng nhập mới. Chỉ trường hợp
    // đó mới xoá cookie; lỗi tạm thời thì GIỮ NGUYÊN — hết 429 là người dùng
    // quay lại làm việc tiếp, không phải đăng nhập lại.
    if (!isTransient) {
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith("sb-")) loginResponse.cookies.delete(cookie.name);
      }
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
