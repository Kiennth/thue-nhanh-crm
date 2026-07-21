"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Supabase (gói free, chưa cấu hình SMTP riêng) không cho tuỳ chỉnh link
// trong email mời/khôi phục mật khẩu — link mặc định trả token qua URL hash
// fragment (#access_token=...) sau khi Supabase tự xác thực. Hash fragment
// không tới được server nên phải đọc và setSession() ở client tại đây.
function readHashTokens() {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token")) {
    return null;
  }
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

export function InviteHashHandler({ children }: { children: React.ReactNode }) {
  const [processing, setProcessing] = useState(() => readHashTokens() !== null);

  useEffect(() => {
    const tokens = readHashTokens();
    if (!tokens) return;

    const supabase = createClient();
    supabase.auth.setSession(tokens).then(({ error }) => {
      if (!error) {
        window.location.replace("/set-password");
      } else {
        setProcessing(false);
      }
    });
  }, []);

  if (processing) {
    return <p className="text-center text-sm text-muted-foreground">Đang xác thực...</p>;
  }

  return <>{children}</>;
}
