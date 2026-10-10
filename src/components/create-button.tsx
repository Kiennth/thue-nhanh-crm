import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Nút tạo thống nhất ở góc phải hàng tiêu đề mọi trang danh sách (B2, Grok
// CRM 09/10): đỏ đặc, dấu +, cao 36px — "+ Tạo đơn", "+ Thêm khách",
// "+ Thêm hàng hoá"… Mỗi trang chỉ 1 nút này. Dùng được làm trigger của
// Dialog (nhận và chuyển tiếp mọi props/ref như Button).
export function CreateButton({ label, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button size="lg" className="px-3.5" {...props}>
      <Plus className="size-4" />
      {label}
    </Button>
  );
}
