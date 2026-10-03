import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đặt mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
          <Link
            href="/"
            className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Quay lại, không đổi
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
