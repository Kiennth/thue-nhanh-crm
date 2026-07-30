import "server-only";
import puppeteer from "puppeteer";
import { cookies } from "next/headers";
import type { PrintDocType } from "@/lib/print-docs";

// Xuất PDF trang in chứng từ (/orders/[id]/print?type=...) bằng Chromium
// headless (Puppeteer) — tự forward cookie đăng nhập hiện tại để trang in
// (đứng sau requireRole) render đúng dữ liệu, không cần route/token riêng.
export async function renderOrderDocumentPdf(
  orderId: string,
  docType: PrintDocType,
): Promise<Buffer> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/orders/${orderId}/print?type=${docType}`;
  const cookieStore = await cookies();
  const targetUrl = new URL(url);

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setCookie(
      ...cookieStore.getAll().map((c) => ({
        name: c.name,
        value: c.value,
        domain: targetUrl.hostname,
        path: "/",
      })),
    );
    await page.goto(url, { waitUntil: "networkidle0" });
    // preferCSSPageSize: true — trang in đã tự khai @page { size: A4; margin:
    // 1.5cm } trong style riêng, dùng lại luôn thay vì set trùng ở đây.
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
