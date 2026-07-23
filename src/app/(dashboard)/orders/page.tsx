import { redirect } from "next/navigation";

// Nội dung trang này đã gộp vào Trang chủ — giữ route lại để link/bookmark
// cũ không bị 404, chỉ chuyển hướng về "/".
export default function OrdersPage() {
  redirect("/");
}
