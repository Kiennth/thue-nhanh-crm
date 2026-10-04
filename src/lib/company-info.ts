// Thông tin công ty hiển thị trên các chứng từ in ấn (hợp đồng/báo giá/biên
// bản bàn giao) — lấy từ Settings > General (Booqable) ngày 2026-07-28.
// Cập nhật lại đây nếu công ty đổi địa chỉ/số tài khoản.
export const COMPANY_INFO = {
  name: "CTCP TMDV THUÊ NHANH",
  taxCode: "0316682493",
  address: "187/7 Điện Biên Phủ, Phường Tân Định, TP Hồ Chí Minh",
  phone: "0888441886",
  email: "ceo@thuenhanh.vn",
  website: "https://thuenhanh.vn",
  // Thông tin pháp lý dùng trên chứng từ theo mẫu CEO gửi 2026-09-30 (Báo giá,
  // Đề nghị thanh toán, Biên bản bàn giao/nghiệm thu).
  legalName: "CÔNG TY CỔ PHẦN THƯƠNG MẠI DỊCH VỤ THUÊ NHANH",
  legalAddress: "187/7 Điện Biên Phủ, Phường Tân Định, Thành phố Hồ Chí Minh, Việt Nam",
  representative: "Ông NGUYỄN TRUNG KIÊN",
  representativeName: "NGUYỄN TRUNG KIÊN",
  representativeTitle: "Giám đốc",
  // Tài khoản in trên chứng từ + nhận QR (CEO 2026-10-04 đổi Techcombank →
  // VPBank vì SePay chỉ nối được VPBank để tự ghi nhận tiền vào).
  documentBank: {
    accountName: "CONG TY CO PHAN THUONG MAI DICH VU THUE NHANH",
    accountNumber: "147714078888",
    bankName: "VPBANK - Ngân hàng TMCP Việt Nam Thịnh Vượng",
    shortName: "VPBank",
    // Mã BIN Napas dùng cho VietQR.
    bin: "970432",
  },
  bankAccountName: "CTCP TM DICH VU THUE NHANH",
  // Chỉ in VPBank (CEO 2026-10-04) — tiền vào VPBank mới tự ghi nhận qua
  // SePay. Techcombank 19037 15541 1017 vẫn của công ty nhưng không in nữa.
  bankAccounts: [{ bankName: "VPBank", accountNumber: "1477 1407 8888" }],
};
