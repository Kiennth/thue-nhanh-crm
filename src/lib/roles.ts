import type { UserRole } from "@/types/database";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  ke_toan: "Kế toán",
  ky_thuat_sales: "Kỹ thuật/Sales",
  quan_ly_chi_nhanh: "Quản lý chi nhánh",
};

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
    roles: ["admin", "ke_toan", "quan_ly_chi_nhanh"],
  },
  {
    href: "/employees",
    label: "Nhân viên",
    roles: ["admin", "ke_toan", "quan_ly_chi_nhanh"],
  },
  {
    href: "/commission",
    label: "Chính sách khoán",
    roles: ["admin", "ke_toan"],
  },
  {
    href: "/activity",
    label: "Nhật ký hoạt động",
    roles: ["admin", "ke_toan"],
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/customers",
    label: "Khách hàng",
    roles: ["admin", "ke_toan", "quan_ly_chi_nhanh"],
  },
  {
    href: "/equipment",
    label: "Thiết bị",
    roles: ["admin", "ke_toan", "quan_ly_chi_nhanh"],
  },
  {
    href: "/equipment/reports",
    label: "Báo cáo thiết bị",
    roles: ["admin", "ke_toan"],
  },
  {
    href: "/payroll",
    label: "Bảng lương",
    roles: ["admin", "ke_toan", "quan_ly_chi_nhanh"],
  },
];
