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

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/branches",
    label: "Chi nhánh",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
  {
    href: "/employees",
    label: "Nhân viên",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
  {
    href: "/customers",
    label: "Khách hàng",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
  {
    href: "/equipment",
    label: "Thiết bị",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
  {
    href: "/equipment/reports",
    label: "Báo cáo thiết bị",
    roles: ["admin", "ke_toan"],
  },
  {
    href: "/commission",
    label: "Chính sách khoán",
    roles: ["admin", "ke_toan"],
  },
  {
    href: "/payroll",
    label: "Bảng lương",
    roles: ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"],
  },
];
