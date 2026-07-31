import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Industrial Skeuomorphism: Inter (humanist, trung tính kiểu Dieter Rams) +
// JetBrains Mono cho mọi số liệu/nhãn kỹ thuật. Giữ nguyên tên biến
// --font-geist-* để khỏi sửa @theme mapping trong globals.css.
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
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
      className={`${interSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
