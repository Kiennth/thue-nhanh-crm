import type { UserRole } from "@/types/database";

export const ROLE_LABELS: Record<UserRole, string> = {
  giam_doc: "Giám đốc",
  admin: "Admin",
  ke_toan: "Kế toán",
  cua_hang_truong: "Cửa hàng trưởng",
  ky_thuat_sales: "Kỹ thuật/Sales",
};

// Cấp bậc quyền dùng chung toàn app (không có kế thừa thật ở tầng code —
// giam_doc ⊇ admin được biểu diễn bằng cách LUÔN có mặt trong mọi mảng bên
// dưới, không phải bằng logic so sánh cấp bậc).
export const DIRECTOR_ONLY: UserRole[] = ["giam_doc"];
export const MANAGE_ROLES: UserRole[] = ["giam_doc", "admin", "ke_toan"];
export const ALL_ROLES: UserRole[] = [
  "giam_doc",
  "admin",
  "ke_toan",
  "cua_hang_truong",
  "ky_thuat_sales",
];
// Cửa hàng trưởng/Kỹ thuật-Sale chỉ thấy/thao tác đơn hàng + thiết bị đúng
// chi nhánh mình (RLS + query filter) — không áp dụng cho khách hàng (dùng
// chung toàn hệ thống, xem CEO quyết định trong plan cải tổ phân quyền).
export const BRANCH_SCOPED_ROLES: UserRole[] = ["cua_hang_truong", "ky_thuat_sales"];
// Ai được SỬA thiết bị (tồn kho/mua/thanh lý/chuyển kho) — Cửa hàng trưởng
// có quyền mới này (giới hạn chi nhánh mình), Kỹ thuật/Sale vẫn chỉ xem.
export const EQUIPMENT_WRITE_ROLES: UserRole[] = ["giam_doc", "admin", "ke_toan", "cua_hang_truong"];

export interface NavItem {
  href: string;
  label: string;
  roles: UserRole[];
}

// Các mục quản trị tần suất thấp — gom vào menu "Cài đặt" nhỏ ở footer
// sidebar (xem app-sidebar.tsx) thay vì nav chính, để nav chính chỉ còn
// những mục dùng liên tục.
export const SETTINGS_ITEMS: NavItem[] = [
  {
    href: "/branches",
    label: "Chi nhánh",
    roles: [...DIRECTOR_ONLY],
  },
  // Ba mục dưới đây động tới nhân sự, tiền công và giá bán — CEO chốt
  // 2026-08-01 chỉ Giám đốc được vào, kể cả Admin và Kế toán.
  {
    href: "/employees",
    label: "Nhân viên",
    roles: [...DIRECTOR_ONLY],
  },
  {
    href: "/commission",
    label: "Chính sách khoán",
    roles: [...DIRECTOR_ONLY],
  },
  {
    href: "/pricing-templates",
    label: "Bảng giá mẫu",
    roles: [...DIRECTOR_ONLY],
  },
  {
    href: "/activity",
    label: "Nhật ký hoạt động",
    roles: [...MANAGE_ROLES],
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/orders",
    label: "Đơn hàng",
    roles: [...ALL_ROLES],
  },
  {
    href: "/customers",
    label: "Khách hàng",
    roles: ["giam_doc", "admin", "ke_toan", "cua_hang_truong"],
  },
  {
    href: "/equipment",
    label: "Thiết bị",
    roles: [...ALL_ROLES],
  },
  {
    href: "/payroll",
    label: "Bảng lương",
    roles: ["giam_doc", "admin", "ke_toan", "cua_hang_truong"],
  },
];
