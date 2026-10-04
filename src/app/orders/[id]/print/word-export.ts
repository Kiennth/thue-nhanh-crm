// Xuất chứng từ đang hiển thị ra file Word (.doc) để sửa tay (CEO
// 2026-10-04: "để PDF thì tao sẽ không sửa được"). Chạy ngay trên trình
// duyệt — không cần server/Google. Word (và Google Drive khi kéo file vào)
// mở được HTML dạng .doc; vì Word bỏ qua CSS ngoài nên "đóng băng" style
// đang hiển thị thành style inline, và đổi các hàng flex (Bên A | ô Ngày/PO,
// 2 khối ký tên) thành bảng không viền để giữ bố cục 2 cột.

function inlineStyles(live: Element, copy: HTMLElement) {
  const cs = getComputedStyle(live);
  const s: string[] = [];
  if (Number(cs.fontWeight) >= 600) s.push("font-weight:bold");
  if (cs.fontStyle === "italic") s.push("font-style:italic");
  if (cs.textDecorationLine.includes("underline")) s.push("text-decoration:underline");
  if (["center", "right", "justify"].includes(cs.textAlign)) s.push(`text-align:${cs.textAlign}`);
  s.push(`font-size:${(parseFloat(cs.fontSize) * 0.75).toFixed(1)}pt`);
  if (cs.textTransform === "uppercase") s.push("text-transform:uppercase");
  const mt = parseFloat(cs.marginTop);
  const mb = parseFloat(cs.marginBottom);
  if (live.tagName === "P" || /^H[1-6]$/.test(live.tagName)) {
    s.push(`margin:${(mt * 0.75).toFixed(1)}pt 0 ${(mb * 0.75).toFixed(1)}pt 0`);
  }
  if (live.tagName === "TABLE") s.push("border-collapse:collapse", "width:100%");
  if (live.tagName === "TD" || live.tagName === "TH") {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const w = cs.getPropertyValue(`border-${side}-width`);
      const st = cs.getPropertyValue(`border-${side}-style`);
      if (st !== "none" && parseFloat(w) > 0) {
        s.push(`border-${side}:${(parseFloat(w) * 0.75).toFixed(1)}pt ${st} ${cs.getPropertyValue(`border-${side}-color`)}`);
      }
    }
    s.push(`padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`);
    s.push(`vertical-align:${cs.verticalAlign === "baseline" ? "top" : cs.verticalAlign}`);
  }
  copy.removeAttribute("class");
  copy.setAttribute("style", s.join(";"));
}

export function buildWordHtml(root: HTMLElement, title: string): string {
  const clone = root.cloneNode(true) as HTMLElement;
  const live = [root, ...Array.from(root.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))] as HTMLElement[];
  // Ghi nhận hàng flex + khoảng trống lớn TRƯỚC khi xoá class (cần computed
  // style của bản gốc).
  const flexRows: HTMLElement[] = [];
  const gaps: { el: HTMLElement; lines: number }[] = [];
  live.forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === "flex" && cs.flexDirection === "row" && el.children.length >= 2) flexRows.push(copies[i]);
    // Khoảng trống (chỗ ký tên, cách khối) — Word bỏ qua margin của div nên
    // đổi thành dòng trống: margin-top lớn, hoặc khối rỗng có chiều cao.
    const empty = !el.textContent?.trim() && !el.querySelector("img");
    const gap = parseFloat(cs.marginTop) + (empty ? (el as HTMLElement).offsetHeight : 0);
    if (gap >= 14 && el !== root) gaps.push({ el: copies[i], lines: Math.min(6, Math.round(gap / 18) || 1) });
    inlineStyles(el, copies[i]);
  });
  for (const { el, lines } of gaps) {
    for (let k = 0; k < lines; k++) {
      const spacer = document.createElement("p");
      spacer.setAttribute("style", "margin:0");
      spacer.innerHTML = "&nbsp;";
      el.before(spacer);
    }
  }
  // Hàng flex → bảng 1 dòng không viền, mỗi con 1 ô.
  for (const row of flexRows) {
    const table = document.createElement("table");
    table.setAttribute("style", "border-collapse:collapse;width:100%");
    const tr = table.insertRow();
    const kids = Array.from(row.children) as HTMLElement[];
    kids.forEach((kid, idx) => {
      const td = tr.insertCell();
      const align = idx === kids.length - 1 && kids.length > 1 ? "right" : "left";
      td.setAttribute("style", `vertical-align:top;padding:0 4pt;text-align:${align}`);
      td.appendChild(kid);
    });
    row.replaceWith(table);
  }
  clone.querySelectorAll("[data-no-export], script, style, button").forEach((n) => n.remove());
  clone.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && src.startsWith("/")) img.setAttribute("src", location.origin + src);
  });

  return (
    "﻿" +
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${title}</title>` +
    `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->` +
    `<style>@page WordSection1{size:21cm 29.7cm;margin:1.5cm}div.WordSection1{page:WordSection1}` +
    `body{font-family:"Times New Roman",serif;font-size:10pt}table{border-collapse:collapse}</style></head>` +
    `<body><div class="WordSection1">${clone.innerHTML}</div></body></html>`
  );
}

export function downloadWord(root: HTMLElement, fileName: string) {
  const blob = new Blob([buildWordHtml(root, fileName)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
