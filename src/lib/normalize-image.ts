// Chuẩn ảnh sản phẩm khi tải lên CRM (CEO 2026-10-11, theo chuẩn Gió Biển) —
// cùng luật với đợt chuẩn hoá hàng loạt 11/10:
//  - nền trắng sẵn (4 góc trắng) → cắt sát khoảng trắng thừa, chừa lề ~6%,
//    đệm thành ảnh vuông nền trắng;
//  - ảnh chụp có nền thật / ảnh quảng cáo → giữ nguyên khung, chỉ thu nhỏ;
//  → tối đa 1024px, WebP. Chạy trên trình duyệt (CRM chạy Cloudflare Workers,
//  không có sharp). Lỗi (trình duyệt cũ) thì trả lại file gốc.
const MAX_SIDE = 1024;
const WHITE = 248;

export async function normalizeProductImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file);
    const src = document.createElement("canvas");
    src.width = bmp.width;
    src.height = bmp.height;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!sctx) return file;
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, src.width, src.height);
    sctx.drawImage(bmp, 0, 0);
    bmp.close();

    const { data, width, height } = sctx.getImageData(0, 0, src.width, src.height);
    const isWhite = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE;
    };
    const m = 2;
    const whiteBg =
      isWhite(m, m) && isWhite(width - 1 - m, m) && isWhite(m, height - 1 - m) && isWhite(width - 1 - m, height - 1 - m);

    let sx = 0, sy = 0, sw = width, sh = height, outW: number, outH: number, dx: number, dy: number, dw: number, dh: number;
    if (whiteBg) {
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!isWhite(x, y)) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= 0) {
        sx = x0;
        sy = y0;
        sw = x1 - x0 + 1;
        sh = y1 - y0 + 1;
      }
      const box = Math.round(Math.max(sw, sh) * 1.12);
      const side = Math.min(MAX_SIDE, box);
      const k = side / box;
      outW = outH = side;
      dx = ((box - sw) / 2) * k;
      dy = ((box - sh) / 2) * k;
      dw = sw * k;
      dh = sh * k;
    } else {
      const k = Math.min(1, MAX_SIDE / Math.max(width, height));
      outW = dw = Math.round(width * k);
      outH = dh = Math.round(height * k);
      dx = dy = 0;
    }

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) return file;
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, outW, outH);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);

    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/webp", 0.88));
    if (!blob || blob.type !== "image/webp") return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

// Ô <input type="file"> trong form gửi thẳng lên server action: thay file đã
// chọn bằng bản chuẩn hoá (DataTransfer) để form gửi ảnh mới.
export async function normalizeFileInput(input: HTMLInputElement): Promise<File | null> {
  const file = input.files?.[0];
  if (!file) return null;
  const norm = await normalizeProductImage(file);
  if (norm !== file) {
    const dt = new DataTransfer();
    dt.items.add(norm);
    input.files = dt.files;
  }
  return norm;
}
