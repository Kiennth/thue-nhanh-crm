import type { Metadata } from "next";
import { Roboto, JetBrains_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// CEO chốt 2026-08-06: đổi sang Roboto — đúng font fallback Booqable đang
// dùng (proxima-nova, Roboto, sans-serif; Proxima Nova là font trả phí,
// không nhúng được). Giữ nguyên tên biến --font-geist-* để khỏi sửa @theme
// mapping trong globals.css. JetBrains Mono vẫn có sẵn cho chỗ thật sự cần
// số liệu canh cột đều, không còn bị ép dùng tràn lan như bản Industrial
// Skeuomorphism trước đó.
const robotoSans = Roboto({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "CRM Cho Thuê Thiết Bị",
  description: "Hệ thống quản lý nội bộ cho thuê thiết bị",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${robotoSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextTopLoader
          color="linear-gradient(to right, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6)"
          height={3}
          showSpinner={false}
        />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
