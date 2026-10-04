"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  login,
  requestPasswordReset,
  type LoginState,
  type PasswordResetState,
} from "@/lib/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );
  const [resetMode, setResetMode] = useState(false);
  const [email, setEmail] = useState("");

  if (resetMode) {
    return <PasswordResetForm defaultEmail={email} onBack={() => setResetMode(false)} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
      <button
        type="button"
        onClick={() => setResetMode(true)}
        className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        Quên / đổi mật khẩu?
      </button>
    </form>
  );
}

// Gửi email có link đặt mật khẩu mới (CEO 2026-10-04) — bấm link trong email
// là vào thẳng trang "Đặt mật khẩu".
function PasswordResetForm({ defaultEmail, onBack }: { defaultEmail: string; onBack: () => void }) {
  const [state, formAction, pending] = useActionState<PasswordResetState, FormData>(
    requestPasswordReset,
    undefined,
  );

  if (state && "sent" in state) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Nếu email này có tài khoản CRM, hệ thống đã gửi link đặt mật khẩu mới. Mở hộp thư (kể cả mục
          Spam), bấm link trong email rồi nhập mật khẩu mới.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>
          ← Quay lại đăng nhập
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Nhập email đăng nhập — hệ thống gửi link để đặt mật khẩu mới.
      </p>
      <div className="space-y-2">
        <Label htmlFor="reset_email">Email</Label>
        <Input
          id="reset_email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
        />
      </div>
      {state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Đang gửi..." : "Gửi link đặt mật khẩu"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Quay lại đăng nhập
      </button>
    </form>
  );
}
