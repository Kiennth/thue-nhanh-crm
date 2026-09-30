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
  documentBank: {
    accountName: "CONG TY CO PHAN THUONG MAI DICH VU THUE NHANH",
    accountNumber: "19037155411017",
    bankName: "TECHCOMBANK - Ngân hàng TMCP Kỹ Thương Việt Nam. CN: Hồ Chí Minh",
  },
  bankAccountName: "CTCP TM DICH VU THUE NHANH",
  bankAccounts: [
    { bankName: "Techcombank", accountNumber: "19037 15541 1017" },
    { bankName: "VPBank", accountNumber: "1477 1407 8888" },
  ],
};
