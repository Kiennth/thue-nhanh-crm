export type PrintDocType = "contract" | "quote" | "handover";

export const PRINT_DOC_TITLES: Record<PrintDocType, string> = {
  contract: "HỢP ĐỒNG CHO THUÊ",
  quote: "BÁO GIÁ",
  handover: "BIÊN BẢN BÀN GIAO",
};

export const PRINT_DOC_MENU_LABELS: Record<PrintDocType, string> = {
  contract: "Tạo hợp đồng",
  quote: "Tạo báo giá",
  handover: "Tạo biên bản bàn giao",
};

// Điều khoản mặc định theo từng loại chứng từ — bản nháp ban đầu, CẦN người
// có thẩm quyền rà lại nội dung pháp lý trước khi dùng chính thức với khách.
// Sửa trực tiếp tại đây (chưa có màn hình cài đặt riêng cho bản V1 này).
export const PRINT_DOC_TERMS: Record<PrintDocType, string[]> = {
  contract: [
    "Bên thuê thanh toán đầy đủ tiền thuê thiết bị và tiền ký quỹ (nếu có) trước khi nhận hàng.",
    "Bên thuê có trách nhiệm bảo quản thiết bị, sử dụng đúng mục đích và hoàn trả đúng thời hạn ghi trong hợp đồng.",
    "Mọi hư hỏng, mất mát thiết bị trong thời gian thuê do Bên thuê chịu trách nhiệm bồi thường theo giá trị thực tế.",
    "Tiền ký quỹ được hoàn lại sau khi hai bên đối chiếu, xác nhận thiết bị đã trả đủ và không hư hỏng.",
    "Hợp đồng có hiệu lực từ ngày ký, được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.",
  ],
  quote: [
    "Báo giá trên chưa bao gồm các chi phí phát sinh ngoài phạm vi (nếu có) và có thể thay đổi tuỳ thời điểm chốt đơn.",
    "Báo giá có hiệu lực trong vòng 03 ngày kể từ ngày phát hành, trừ khi có thoả thuận khác.",
    "Đơn hàng được xác nhận sau khi khách hàng phản hồi chốt đơn và/hoặc thanh toán cọc giữ chỗ.",
  ],
  handover: [
    "Hai bên xác nhận đã kiểm tra số lượng, tình trạng thiết bị tại thời điểm bàn giao/thu hồi như liệt kê trên.",
    "Mọi khác biệt so với danh sách trên (nếu có) đã được ghi chú rõ tại mục ghi chú kèm theo.",
    "Biên bản này là căn cứ đối chiếu khi thanh lý hợp đồng và hoàn tiền cọc (nếu có).",
  ],
};
