import "server-only";
import { cookies } from "next/headers";
import { getSiteUrl } from "@/lib/site-url";
import { launchBrowser } from "@/lib/pdf";
import type { PrintDocType } from "@/lib/print-docs";

// HTML của 1 chứng từ để Google Drive chuyển thành Google Docs (CEO
// 2026-10-04). Mở đúng trang in (/orders/[id]/print?type=...) bằng Chromium
// headless như bản PDF, rồi "đóng băng" style đang hiển thị (Tailwind class
// → style inline: đậm/nghiêng/căn lề/cỡ chữ/viền bảng) vì Google Docs chỉ
// đọc style inline + thẻ HTML cơ bản, bỏ qua CSS ngoài.
export async function renderOrderDocumentHtml(orderId: string, docType: PrintDocType): Promise<string> {
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
    const body = await page.evaluate(() => {
      const root = document.querySelector("[data-doc-root]");
      if (!root) return "";
      const clone = root.cloneNode(true) as HTMLElement;
      const live = [root, ...Array.from(root.querySelectorAll("*"))];
      const copies = [clone, ...Array.from(clone.querySelectorAll("*"))] as HTMLElement[];
      live.forEach((el, i) => {
        const cs = getComputedStyle(el);
        const c = copies[i];
        const s: string[] = [];
        if (Number(cs.fontWeight) >= 600) s.push("font-weight:bold");
        if (cs.fontStyle === "italic") s.push("font-style:italic");
        if (cs.textDecorationLine.includes("underline")) s.push("text-decoration:underline");
        if (["center", "right", "justify"].includes(cs.textAlign)) s.push(`text-align:${cs.textAlign}`);
        s.push(`font-size:${(parseFloat(cs.fontSize) * 0.75).toFixed(1)}pt`);
        if (cs.textTransform === "uppercase") s.push("text-transform:uppercase");
        if (el.tagName === "TABLE") s.push("border-collapse:collapse", "width:100%");
        if (el.tagName === "TD" || el.tagName === "TH") {
          for (const side of ["top", "right", "bottom", "left"] as const) {
            const w = cs.getPropertyValue(`border-${side}-width`);
            const st = cs.getPropertyValue(`border-${side}-style`);
            if (st !== "none" && parseFloat(w) > 0) {
              s.push(`border-${side}:${w} ${st} ${cs.getPropertyValue(`border-${side}-color`)}`);
            }
          }
          s.push(`padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`);
          s.push(`vertical-align:${cs.verticalAlign}`);
        }
        c.removeAttribute("class");
        c.setAttribute("style", s.join(";"));
      });
      clone.querySelectorAll("[data-no-export], script, style, button").forEach((n) => n.remove());
      return clone.innerHTML;
    });
    if (!body) throw new Error("Không đọc được nội dung chứng từ.");
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:'Times New Roman',serif;font-size:10pt">${body}</body></html>`;
  } finally {
    await browser.close();
  }
}
