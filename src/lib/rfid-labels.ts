import type { RfidScanType, RfidTagStatus } from "@/types/database";

export const RFID_SCAN_TYPE_LABELS: Record<RfidScanType, string> = {
  giao_hang: "Giao hàng",
  thu_hoi: "Thu hồi",
};

export const RFID_TAG_STATUS_LABELS: Record<RfidTagStatus, string> = {
  in_stock: "Trong kho",
  with_customer: "Đang ở khách",
};
