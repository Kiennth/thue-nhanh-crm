"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.string().email({ message: "Email không hợp lệ." }),
  password: z.string().min(1, { message: "Vui lòng nhập mật khẩu." }),
});

export type LoginState =
  | {
      error: string;
    }
  | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  redirect("/");
}

// "Quên / đổi mật khẩu" ở màn hình đăng nhập (CEO 2026-10-04): gửi email
// khôi phục của Supabase. Link trong email trả token về /login (hash
// fragment) → InviteHashHandler tạo phiên rồi chuyển sang /set-password —
// cùng đường với email mời nhân viên. Luôn báo cùng 1 câu dù email có tồn
// tại hay không, để không lộ ai là nhân viên.
export type PasswordResetState = { error: string } | { sent: true } | undefined;

export async function requestPasswordReset(
  _prevState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = z.string().trim().email({ message: "Email không hợp lệ." }).safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email không hợp lệ." };
  }

  const origin = (await headers()).get("origin") ?? "https://crm.thuenhanh.vn";
  // Gọi thẳng API khôi phục của Supabase Auth (không qua thư viện @supabase/ssr):
  // thư viện mặc định PKCE — link trong email trả "?code=" chỉ đổi được ra
  // phiên trên ĐÚNG trình duyệt đã bấm gửi (CEO 2026-10-04 bấm link thì kẹt
  // ở trang đăng nhập). Không gửi code_challenge → Supabase dùng luồng token
  // qua hash (#access_token=…) như email mời nhân viên — InviteHashHandler ở
  // /login nhận rồi chuyển sang /set-password, mở link trên máy nào cũng được.
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(`${origin}/login`)}`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: parsed.data }),
    },
  );
  // Supabase giới hạn số email/giờ — chỉ lỗi này mới báo riêng.
  if (res.status === 429) {
    return { error: "Đã gửi quá nhiều email trong thời gian ngắn — thử lại sau ít phút." };
  }
  return { sent: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const SetPasswordSchema = z
  .object({
    password: z.string().min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp.",
    path: ["confirmPassword"],
  });

export type SetPasswordState = { error: string } | undefined;

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = SetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "Không thể đặt mật khẩu: " + error.message };
  }

  redirect("/");
}
