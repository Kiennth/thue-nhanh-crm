import "server-only";
import { cookies } from "next/headers";
import type { Browser } from "puppeteer-core";
import puppeteerCloudflare from "@cloudflare/puppeteer";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSiteUrl } from "@/lib/site-url";
import type { PrintDocType } from "@/lib/print-docs";

// Cloudflare Workers chạy trong V8 isolate (không có child_process/filesystem
// cho binary ngoài) — Puppeteer/Chromium thường KHÔNG thể chạy ở đây dù đã
// bật nodejs_compat. Trên Workers dùng binding BROWSER (Cloudflare Browser
// Rendering — @cloudflare/puppeteer điều khiển 1 Chromium thật chạy phía
// Cloudflare qua RPC, không cần binary local) thay vì Puppeteer đầy đủ. Cách
// nhận diện chuẩn theo tài liệu Cloudflare: navigator.userAgent cố định là
// "Cloudflare-Workers".
const isCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// Import "mờ" — che specifier khỏi static analysis để esbuild của OpenNext
// không cố bundle puppeteer/@sparticuz vào worker (bundle sẽ fail vì các
// dynamic import nội bộ của puppeteer). Node runtime thật vẫn import bình
// thường lúc chạy; trên Workers không bao giờ tới được đây nhờ guard trên.
//
// LAZY — không dựng Function() ở top-level module. `new Function` là code-gen
// từ chuỗi, bị Cloudflare Workers chặn cứng (EvalError) NGAY LÚC NẠP MODULE,
// trước khi bất kỳ dòng code nào trong file chạy — kể cả guard
// isCloudflareWorkers phía trên cũng không kịp chặn vì nó chỉ chặn ở
// runtime, còn eval bị chặn ở compile-time của isolate. Từng làm sập toàn bộ
// Server Action nào lỡ import chung route với file này (mọi action trên
// /orders/[id] dùng chung 1 chunk với SendDocumentEmailDialog).
function opaqueImport<T>(m: string): Promise<T> {
  return (new Function("m", "return import(m)") as (m: string) => Promise<T>)(m);
}

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
    const { env } = await getCloudflareContext({ async: true });
    // @cloudflare/puppeteer trả về Browser tương thích API với puppeteer-core
    // (newPage/pdf/close) — ép kiểu để dùng chung phần render bên dưới.
    const browser = await puppeteerCloudflare.launch(env.BROWSER);
    return browser as unknown as Browser;
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
  const baseUrl = await getSiteUrl();
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
