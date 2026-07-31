import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildCompanyFirstOrderMap } from "@/lib/customer-reports";

// RLS (orders_select_branch_scoped) chỉ cho Cửa hàng trưởng/Kỹ thuật-Sale
// đọc đơn của chi nhánh mình, nên với họ không thể biết khách đã từng thuê ở
// kho khác hay chưa — mà đó lại đúng là thứ để phân biệt "khách mới của công
// ty" với "khách mới của chi nhánh".
//
// Dùng service-role đọc đúng 2 cột ngày/khách để dựng mốc đó. KHÔNG trả ra
// bất cứ dữ liệu nào của chi nhánh khác: kết quả chỉ là ngày thuê đầu tiên
// của từng khách, và chỉ được dùng để đánh dấu cũ/mới cho các khách mà người
// xem vốn đã thấy.
export async function fetchCompanyFirstOrderDates(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const orders = await fetchAllRows<{
    customer_id: string;
    order_date: string;
    cancelled_at: string | null;
  }>((from, to) =>
    admin.from("orders").select("customer_id, order_date, cancelled_at").range(from, to),
  );
  return buildCompanyFirstOrderMap(orders);
}
