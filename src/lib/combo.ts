// Combo sản phẩm (CEO 2026-09-26) — phần tính toán thuần, không đụng DB.

// Chia tổng tiền combo cho các dòng con theo trọng số (giá thuê lẻ của từng
// món cho cùng khung thời gian). Làm tròn tới đồng; phần lẻ dồn vào dòng cuối
// để tổng các phần luôn khớp đúng tổng combo. Mọi trọng số bằng 0 (món chưa có
// giá lẻ) thì chia đều.
export function splitTotalByWeights(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const effective = sum > 0 ? safe : safe.map(() => 1);
  const effectiveSum = sum > 0 ? sum : effective.length;

  const shares: number[] = [];
  let allocated = 0;
  effective.forEach((w, i) => {
    if (i === effective.length - 1) {
      shares.push(Math.round((total - allocated) * 100) / 100);
      return;
    }
    const share = Math.round((total * w) / effectiveSum);
    shares.push(share);
    allocated += share;
  });
  return shares;
}

// Số bộ combo ghép được tại 1 kho = món con ít nhất (số sẵn có / số cần mỗi
// bộ). Combo chưa khai báo món nào thì 0.
export function countAssemblableSets(
  components: { quantity: number; available: number }[],
): number {
  if (!components.length) return 0;
  return Math.max(
    0,
    Math.min(...components.map((c) => Math.floor(c.available / Math.max(1, c.quantity)))),
  );
}
