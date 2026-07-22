import type { TaskType } from "@/types/database";

// Giá trong đơn (unit_price/line_total/total_value) đều CHƯA gồm VAT — 8% là
// mức thuế GTGT hiện hành áp dụng cho dịch vụ cho thuê thiết bị.
export const VAT_RATE = 0.08;

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  tiep_nhan_yeu_cau: "Tiếp nhận yêu cầu",
  bao_gia: "Báo giá",
  chot_don: "Chốt đơn",
  ky_hop_dong_thu_coc: "Ký hợp đồng & thu cọc",
  chuan_bi: "Chuẩn bị",
  giao_hang_ban_giao: "Giao hàng & bàn giao",
  van_hanh_xu_ly_su_co: "Vận hành / xử lý sự cố",
  thu_hoi: "Thu hồi",
  nghiem_thu: "Nghiệm thu",
  nhap_kho_bao_tri: "Nhập kho & bảo trì",
};

// Đúng thứ tự nghiệp vụ — khớp với thứ tự khai báo enum task_type trong DB
// (bắt buộc hoàn thành tuần tự theo đúng thứ tự này).
export const TASK_TYPE_SEQUENCE = [
  "tiep_nhan_yeu_cau",
  "bao_gia",
  "chot_don",
  "ky_hop_dong_thu_coc",
  "chuan_bi",
  "giao_hang_ban_giao",
  "van_hanh_xu_ly_su_co",
  "thu_hoi",
  "nghiem_thu",
  "nhap_kho_bao_tri",
] as const satisfies readonly TaskType[];
