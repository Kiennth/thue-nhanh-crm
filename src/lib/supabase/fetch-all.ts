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
