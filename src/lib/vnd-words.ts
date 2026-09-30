// Đọc số tiền thành chữ tiếng Việt cho chứng từ ("Bằng chữ: Một triệu hai
// trăm nghìn đồng") — đúng các quy tắc mười/mươi, một/mốt, năm/lăm, linh.

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const SCALES = ["", "nghìn", "triệu", "tỷ"];

function readTriple(n: number, full: boolean): string {
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  const parts: string[] = [];

  if (hundred > 0 || full) {
    parts.push(DIGITS[hundred], "trăm");
  }
  if (ten === 0) {
    if (unit > 0) {
      if (hundred > 0 || full) parts.push("linh");
      parts.push(DIGITS[unit]);
    }
  } else if (ten === 1) {
    parts.push("mười");
    if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else {
    parts.push(DIGITS[ten], "mươi");
    if (unit === 1) parts.push("mốt");
    else if (unit === 4) parts.push("tư");
    else if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  }
  return parts.join(" ");
}

export function vndToWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Không đồng";

  // Tách nhóm 3 chữ số; từ nhóm thứ 4 trở đi (tỷ) lặp lại chu kỳ nghìn/triệu
  // rồi thêm "tỷ" (vd 1.000.000.000.000 = một nghìn tỷ).
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const scaleIndex = i % 3;
    const billions = Math.floor(i / 3);
    if (group > 0) {
      words.push(readTriple(group, i < groups.length - 1));
      if (SCALES[scaleIndex]) words.push(SCALES[scaleIndex]);
    }
    // Hết 1 chu kỳ (về hàng đơn vị của nhóm tỷ) thì gắn "tỷ" nếu chu kỳ đó
    // có giá trị.
    if (scaleIndex === 0 && billions > 0) {
      const cycleHasValue = groups.slice(i, i + 3).some((g) => g > 0);
      if (cycleHasValue) words.push(...Array(billions).fill("tỷ"));
    }
  }

  const text = words.join(" ").replace(/\s+/g, " ").trim();
  const sentence = `${amount < 0 ? "âm " : ""}${text} đồng`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
