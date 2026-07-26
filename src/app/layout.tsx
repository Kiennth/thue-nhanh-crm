import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
