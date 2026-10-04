import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { InviteHashHandler } from "./invite-hash-handler";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;
  // Link email khôi phục mật khẩu kiểu PKCE rơi về đây ("/" → middleware →
  // /login giữ nguyên ?code=) — chuyển sang đổi mã ra phiên rồi đặt mật khẩu.
  if (code) {
    redirect(`/auth/confirm?code=${encodeURIComponent(code)}&next=/set-password`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          {(error === "reset-invalid" || error === "invite-invalid") && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Link đã hết hạn hoặc được mở trên trình duyệt khác. Bấm &quot;Quên / đổi mật khẩu?&quot; để
              gửi link mới.
            </p>
          )}
          <InviteHashHandler>
            <LoginForm />
          </InviteHashHandler>
        </CardContent>
      </Card>
    </div>
  );
}
