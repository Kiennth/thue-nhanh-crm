import "server-only";

const DEFAULT_CHUNK = 1000;

// Supabase/PostgREST giới hạn 1.000 dòng mỗi lần gọi dù không truyền .range()
// — im lặng cắt bớt kết quả, không báo lỗi. Dùng hàm này bất cứ khi nào cần
// TOÀN BỘ dữ liệu 1 bảng/query (không phải trang hiện tại), tránh lặp lại
// đúng lỗi này đã gặp nhiều lần trong dự án (import Booqable, báo cáo khách
// hàng, doanh thu trang chủ).
//
// Nhận factory function (không phải query builder đã dựng sẵn) vì query
// builder của Supabase không thể gọi lại an toàn với .range() khác nhau sau
// khi đã await 1 lần.
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  chunk = DEFAULT_CHUNK,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await buildQuery(from, from + chunk - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < chunk) break;
    from += chunk;
  }
  return all;
}

// Số trang bắn song song 1 đợt — đủ để cắt thời gian chờ xuống nhiều lần mà
// không mở quá nhiều kết nối cùng lúc tới Postgres (bể connection pool) hay
// chạm giới hạn subrequest đồng thời của Cloudflare Workers.
const PARALLEL_BATCH = 8;

// Bản NHANH của fetchAllRows — dùng khi bảng có thể vượt xa 1.000 dòng và
// đang là điểm nghẽn thật sự (đo bằng preview_logs, không đoán). fetchAllRows
// gọi TUẦN TỰ nên 1 bảng 30.000 dòng tốn ~30 lượt gọi nối đuôi nhau — với
// order_equipment đo được đúng đây là nguyên nhân trang Thiết bị mất 14s.
//
// count và data tách thành 2 tham số riêng — LẦN ĐẦU thử gộp { count: "exact" }
// ngay trong buildQuery khiến MỌI trang (cả 31 trang) đều phải tính lại count
// (COUNT(*) không hề rẻ), kết quả trang chậm ĐI từ 14s lên 30s. Giờ chỉ tính
// count đúng 1 lần, song song với trang đầu tiên.
//
// ĐIỀU KIỆN BẮT BUỘC để dùng hàm này (khác fetchAllRows): buildQuery phải có
// .order(cột_ổn_định) — ví dụ .order("id"). Phân trang bằng range() không có
// ORDER BY là KHÔNG xác định thứ tự vật lý giữa các lần gọi, bắn song song
// lúc đó có thể trùng hoặc sót dòng.
export async function fetchAllRowsFast<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  getCount: () => PromiseLike<{ count: number | null }>,
  chunk = DEFAULT_CHUNK,
): Promise<T[]> {
  const [{ count }, first] = await Promise.all([getCount(), buildQuery(0, chunk - 1)]);
  const firstData = first.data ?? [];
  // Không biết tổng số dòng, hoặc trang đầu đã là trang cuối — không có gì
  // để bắn song song thêm, trả thẳng kết quả đã có.
  if (count == null || firstData.length < chunk) return firstData;

  const remainingStarts: number[] = [];
  for (let from = chunk; from < count; from += chunk) remainingStarts.push(from);

  const all = [...firstData];
  for (let i = 0; i < remainingStarts.length; i += PARALLEL_BATCH) {
    const batch = remainingStarts.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(batch.map((from) => buildQuery(from, from + chunk - 1)));
    for (const r of results) all.push(...(r.data ?? []));
  }
  return all;
}

// Mỗi UUID trong .in() tốn ~39 ký tự trên URL; 100 cái ≈ 3,9KB — vẫn dưới hạn
// độ dài URL của PostgREST/proxy, mà chỉ cần 2 lượt gọi cho 1 tháng bận.
const DEFAULT_ID_CHUNK = 100;

// Nạp mọi dòng thuộc về một tập ID cho trước, cắt tập ID thành nhiều lượt gọi
// để URL không quá dài, và vẫn phân trang trong từng lượt. Dùng thay cho việc
// nạp NGUYÊN bảng rồi lọc trong JS — trên Cloudflare Workers, nạp cả bảng vừa
// đốt hết hạn mức CPU/bộ nhớ vừa vượt số subrequest cho phép (lỗi 1102).
export async function fetchRowsByIds<T>(
  ids: readonly string[],
  buildQuery: (idChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  idChunk = DEFAULT_ID_CHUNK,
): Promise<T[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += idChunk) chunks.push(ids.slice(i, i + idChunk));
  const results = await Promise.all(
    chunks.map((c) => fetchAllRows<T>((from, to) => buildQuery(c, from, to))),
  );
  return results.flat();
}
