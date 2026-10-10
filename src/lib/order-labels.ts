import type { OrderPaymentType, PaymentMethod, TaskType } from "@/types/database";

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

// Khâu TUỲ CHỌN (CEO 2026-10-05): "Vận hành / xử lý sự cố" — đơn không cần hỗ
// trợ, không có sự cố thì coi như không ai làm, bỏ qua để tick thẳng Thu hồi;
// đơn vẫn chạy và hoàn tất bình thường (trigger sync_order_status cũng bỏ qua).
export const OPTIONAL_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(["van_hanh_xu_ly_su_co"]);

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  tien_mat: "Tiền mặt",
  chuyen_khoan: "Chuyển khoản",
  the: "Thẻ",
  vi_dien_tu: "Ví điện tử",
  khac: "Khác",
};

export const PAYMENT_METHOD_OPTIONS = [
  "tien_mat",
  "chuyen_khoan",
  "the",
  "vi_dien_tu",
  "khac",
] as const satisfies readonly PaymentMethod[];

export const ORDER_PAYMENT_TYPE_LABELS: Record<OrderPaymentType, string> = {
  invoice: "Thanh toán hoá đơn",
  deposit_collect: "Thu tiền cọc",
  deposit_refund: "Hoàn tiền cọc",
};

// Luồng đơn (CEO 2026-10-11): Đã báo giá → Chốt đơn → Giao máy → Nhận lại
// máy. orders.status (trigger orders_flow_status) chỉ còn 4 giá trị khi đơn
// chưa kết thúc: bao_gia / giao_hang_ban_giao / thu_hoi (+ nhap_kho_bao_tri khi
// đã nhận lại). Đơn cũ còn giá trị khâu khác thì quy về nhãn gần nhất.
export const ORDER_FLOW_LABELS = {
  quoted: "Đã báo giá (chưa chốt)",
  confirmed: "Đã chốt · chờ giao",
  out: "Đang thuê",
  returned: "Đã nhận lại",
} as const;

export function orderFlowStage(status: TaskType): keyof typeof ORDER_FLOW_LABELS {
  const i = TASK_TYPE_SEQUENCE.indexOf(status);
  if (i <= TASK_TYPE_SEQUENCE.indexOf("chot_don")) return "quoted";
  if (i <= TASK_TYPE_SEQUENCE.indexOf("giao_hang_ban_giao")) return "confirmed";
  if (i <= TASK_TYPE_SEQUENCE.indexOf("thu_hoi")) return "out";
  return "returned";
}

export function orderStatusLabel(o: { status: TaskType; completed_at: string | null; cancelled_at: string | null }): string {
  if (o.cancelled_at) return "Đã huỷ";
  if (o.completed_at) return "Hoàn tất";
  return ORDER_FLOW_LABELS[orderFlowStage(o.status)];
}

// Trạng thái hiển thị/lọc cho danh sách đơn hàng — "completed"/"cancelled" là
// 2 mốc kết thúc (orders.completed_at / cancelled_at), còn lại là orders.status.
export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "bao_gia", label: ORDER_FLOW_LABELS.quoted },
  { value: "giao_hang_ban_giao", label: ORDER_FLOW_LABELS.confirmed },
  { value: "thu_hoi", label: ORDER_FLOW_LABELS.out },
  { value: "completed", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã huỷ" },
];
