import { Badge } from "@/components/ui/badge";

// Mỗi chi nhánh 1 mã viết tắt + 1 màu cố định (dùng chung dải màu categorical
// --chart-1..4 đã kiểm định sáng/tối sẵn có trong globals.css) để nhận diện
// nhanh trên các danh sách nhiều chi nhánh trộn lẫn (đơn hàng, nhân viên...).
// HQ không có đơn hàng riêng (nhân sự văn phòng hỗ trợ mọi chi nhánh) nhưng
// vẫn cần mã màu riêng để nhất quán ở danh sách nhân viên.
const BRANCH_BADGE: Record<string, { code: string; colorVar: string }> = {
  "Hà Nội": { code: "HN", colorVar: "--chart-1" },
  "TP HCM": { code: "HCM", colorVar: "--chart-2" },
  "Đà Nẵng": { code: "ĐN", colorVar: "--chart-3" },
  HQ: { code: "HQ", colorVar: "--chart-4" },
};

export function BranchBadge({ name, className }: { name: string; className?: string }) {
  const cfg = BRANCH_BADGE[name];
  if (!cfg) return <span className="text-muted-foreground">{name}</span>;
  return (
    <Badge
      className={className}
      title={name}
      style={{
        backgroundColor: `var(${cfg.colorVar})`,
        color: `var(${cfg.colorVar}-fg)`,
      }}
    >
      {cfg.code}
    </Badge>
  );
}
