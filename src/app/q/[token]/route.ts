import { redirect } from "next/navigation";
import { verifyQuoteShareToken } from "@/lib/quote-share";

// Link ngắn gửi khách: /q/<mã> → trang báo giá (chế độ khách, không cần đăng nhập).
// ?lang=en → báo giá tiếng Anh (CEO 2026-10-09).
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orderId = await verifyQuoteShareToken(token);
  if (!orderId) return new Response("Link báo giá không hợp lệ hoặc đã hết hạn.", { status: 404 });
  const en = new URL(request.url).searchParams.get("lang") === "en";
  redirect(`/orders/${orderId}/print?type=quote&share=${encodeURIComponent(token)}${en ? "&lang=en" : ""}`);
}
