import { Skeleton } from "@/components/ui/skeleton";

// Khung chờ chung khi chuyển trang trong CRM (Grok CRM 09/10 §A): thanh menu
// đã tắt tải trước hàng loạt (prefetch={false}) nên bấm menu là thấy khung này
// ngay trong lúc máy chủ trả trang.
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
