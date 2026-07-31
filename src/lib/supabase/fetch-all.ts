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
