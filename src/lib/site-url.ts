import "server-only";
import { headers } from "next/headers";

// KHÔNG dùng process.env.NEXT_PUBLIC_SITE_URL cho các đường dẫn build từ
// SERVER (email invite, render PDF...): NEXT_PUBLIC_* được Next.js nhúng
// CỨNG vào bundle lúc `next build`, và khi build chạy trên máy dev, .env.local
// (NEXT_PUBLIC_SITE_URL=http://localhost:3000) có độ ưu tiên CAO HƠN
// .env.production trong thứ tự nạp env của Next.js — nên bundle deploy lên
// Cloudflare vẫn âm thầm mang giá trị localhost dù .env.production đã đúng.
// Đọc thẳng từ header của chính request đang xử lý — luôn đúng bất kể build
// ở đâu, và tự đúng cho cả local dev lẫn production.
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  // Sau Cloudflare, request luôn có x-forwarded-proto: "https"; local dev
  // (next dev, http) thì header này vắng mặt.
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
