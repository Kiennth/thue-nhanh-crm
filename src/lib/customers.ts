import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CustomerType } from "@/types/database";

// Supabase/PostgREST giới hạn tối đa 1000 dòng mỗi lần gọi dù không truyền
// .range() — với 5800+ khách hàng, các báo cáo cần TOÀN BỘ danh sách (không
// chỉ trang hiện tại) nên phải gọi nhiều lần .range() gộp lại.
export async function fetchAllCustomersLite(): Promise<
  { id: string; name: string; customer_type: CustomerType }[]
> {
  const supabase = await createClient();
  const CHUNK = 1000;
  const all: { id: string; name: string; customer_type: CustomerType }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, customer_type")
      .range(from, from + CHUNK - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}
