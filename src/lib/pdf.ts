import "server-only";
import { cookies } from "next/headers";
import type { Browser } from "puppeteer-core";
import type { PrintDocType } from "@/lib/print-docs";

// Cloudflare Workers chạy trong V8 isolate (không có child_process/filesystem
// cho binary ngoài) — Puppeteer/Chromium KHÔNG thể chạy ở đây dù đã bật
// nodejs_compat. Chặn sớm với thông báo rõ ràng thay vì lỗi mơ hồ lúc runtime.
// Cách nhận diện chuẩn theo tài liệu Cloudflare: navigator.userAgent cố định
// là "Cloudflare-Workers".
const isCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// Import "mờ" — che specifier khỏi static analysis để esbuild của OpenNext
// không cố bundle puppeteer/@sparticuz vào worker (bundle sẽ fail vì các
// dynamic import nội bộ của puppeteer). Node runtime thật vẫn import bình
// thường lúc chạy; trên Workers không bao giờ tới được đây nhờ guard trên.
const opaqueImport = new Function("m", "return import(m)") as <T>(m: string) => Promise<T>;

interface ChromiumModule {
  default: { args: string[]; executablePath(): Promise<string> };
}
interface PuppeteerModule {
  default: { launch(options: Record<string, unknown>): Promise<Browser> };
}

// Vercel (serverless) không có Chrome hệ thống và cũng không chứa nổi bản
// Chromium đầy đủ của puppeteer — dùng @sparticuz/chromium (bản nén cho
// serverless) + puppeteer-core. Local/dev/VPS vẫn dùng puppeteer đầy đủ.
// Nhớ set env PUPPETEER_SKIP_DOWNLOAD=1 trên Vercel để build khỏi tải Chrome.
async function launchBrowser(): Promise<Browser> {
  if (isCloudflareWorkers) {
    throw new Error(
      "Xuất PDF chưa hỗ trợ trên hạ tầng Cloudflare Workers hiện tại (Puppeteer cần môi trường Node.js đầy đủ). Cần dùng dịch vụ render PDF ngoài (vd Browser Rendering API của Cloudflare) hoặc host phần này trên nền tảng Node.js server.",
    );
  }
  if (process.env.VERCEL) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      opaqueImport<ChromiumModule>("@sparticuz/chromium"),
      opaqueImport<PuppeteerModule>("puppeteer-core"),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const { default: puppeteer } = await opaqueImport<PuppeteerModule>("puppeteer");
  return puppeteer.launch({ headless: true });
}

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

  const browser = await launchBrowser();
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
