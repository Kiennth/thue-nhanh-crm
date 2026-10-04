import { redirect } from "next/navigation";
import { verifyQuoteShareToken } from "@/lib/quote-share";

// Link ngắn gửi khách: /q/<mã> → trang báo giá (chế độ khách, không cần đăng nhập).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orderId = await verifyQuoteShareToken(token);
  if (!orderId) return new Response("Link báo giá không hợp lệ hoặc đã hết hạn.", { status: 404 });
  redirect(`/orders/${orderId}/print?type=quote&share=${encodeURIComponent(token)}`);
}
