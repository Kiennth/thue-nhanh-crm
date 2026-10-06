import sharp from "sharp";
import fs from "node:fs";
const SB = "https://ianbagzhgxahkmgqintb.supabase.co";
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { Authorization: "Bearer " + K, apikey: K };
const files = JSON.parse(fs.readFileSync("/tmp/bucket_files.json")).filter((f) => f[1] > 500_000);
let saved = 0;
for (const [path, size, mime] of files) {
  const r = await fetch(`${SB}/storage/v1/object/equipment-images/${path}`, { headers: H });
  if (!r.ok) { console.log("GET fail", path, r.status); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  // backup bản gốc
  const b = await fetch(`${SB}/storage/v1/object/equipment-images/originals/${path}`, { method: "POST", headers: { ...H, "Content-Type": mime, "x-upsert": "true" }, body: buf });
  if (!b.ok) { console.log("backup fail", path, b.status, await b.text()); continue; }
  const img = sharp(buf);
  const meta = await img.metadata();
  let out = img.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const isPng = mime.includes("png");
  out = isPng ? out.png({ compressionLevel: 9, palette: true, quality: 85 }) : out.jpeg({ quality: 82, mozjpeg: true });
  const nb = await out.toBuffer();
  if (nb.length >= buf.length) { console.log("skip (không nhỏ hơn)", path); continue; }
  const u = await fetch(`${SB}/storage/v1/object/equipment-images/${path}`, { method: "POST", headers: { ...H, "Content-Type": mime.split(";")[0], "x-upsert": "true", "cache-control": "31536000" }, body: nb });
  if (!u.ok) { console.log("upload fail", path, u.status, await u.text()); continue; }
  saved += buf.length - nb.length;
  console.log(`${path}: ${meta.width}x${meta.height} ${(buf.length/1e3).toFixed(0)}KB → ${(nb.length/1e3).toFixed(0)}KB`);
}
console.log("Tiết kiệm tổng", (saved / 1e6).toFixed(1), "MB");
