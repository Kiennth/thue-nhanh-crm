// Thông tin giao hàng của đơn (CEO 2026-10-05): 3 ô có cấu trúc trên đơn
// (orders.delivery_address / receiver_name / receiver_phone). Đơn cũ chưa
// điền thì gợi ý từ ghi chú dòng phí giao + người đặt — cùng cách dò trước
// đây của biên bản giao hàng.

// 2 SKU phí GIAO (xe máy, ô tô) — địa chỉ nhận hàng ghi trên dòng này.
export const DELIVERY_FEE_TYPE_IDS = new Set([
  "38f5c644-3898-4b1f-a3f5-901e55f77c6a",
  "ce4a5f88-8daa-47c2-92fc-196d1fc321db",
]);

// 2 SKU phí THU HỒI (xe máy, ô tô).
export const COLLECTION_FEE_TYPE_IDS = new Set([
  "13c85fe0-8b13-4d76-9df5-a20b19598cc9",
  "1a53924a-a070-44b0-9441-3f09042af7e7",
]);

type NoteLine = { equipment_type_id: string | null; extra_information: string | null; note: string | null };

// Địa chỉ trên dòng vận chuyển: thường ở "Chi tiết" (extra_information), nhập
// tay trên trang đơn thì ở ghi chú (note) — bỏ ghi chú hệ thống "Gắn lại…".
export function lineAddress(l: { extra_information: string | null; note: string | null }): string {
  const text = l.extra_information?.trim() || (l.note?.trim().startsWith("Gắn lại") ? "" : l.note?.trim()) || "";
  return text.replace(/\s*[\r\n]+\s*/g, " - ");
}

export interface DeliveryContact {
  address: string | null;
  name: string | null;
  phone: string | null;
}

export function suggestDeliveryContact(
  lines: NoteLine[],
  order: { orderer_name: string | null; orderer_phone: string | null },
  customerPhone: string | null = null,
): DeliveryContact {
  const address =
    lines
      .filter((l) => l.equipment_type_id && DELIVERY_FEE_TYPE_IDS.has(l.equipment_type_id))
      .map(lineAddress)
      .find(Boolean) ?? null;
  // SĐT trong ghi chú: ưu tiên số sau chữ "SĐT/ĐT", không thì số di động VN
  // 10 chữ số đứng riêng (không ăn nhầm số CCCD 12 chữ số).
  const compact = (address ?? "").replace(/(\d)[ .](?=\d)/g, "$1");
  const phoneInText =
    compact.match(/(?:SĐT|ĐT|Sđt|sdt|Tel|Phone)\s*:?\s*((?:\+?84|0)\d{9})(?!\d)/i)?.[1] ??
    compact.match(/(?<!\d)(?:\+?84|0)[35789]\d{8}(?!\d)/)?.[0] ??
    null;
  const nameInText =
    address?.match(/(?:Người (?:thuê|nhận)|Liên hệ)\s*:\s*([^\-\n,;]+?)\s*(?:-|,|;|$)/i)?.[1]?.trim() ?? null;
  return {
    address,
    name: order.orderer_name?.trim() || nameInText,
    phone: order.orderer_phone?.trim() || phoneInText || customerPhone || null,
  };
}

// Ô đã điền trên đơn thắng; ô trống thì lấy gợi ý.
export function resolveDeliveryContact(
  order: {
    delivery_address: string | null;
    receiver_name: string | null;
    receiver_phone: string | null;
    orderer_name: string | null;
    orderer_phone: string | null;
  },
  lines: NoteLine[],
  customerPhone: string | null = null,
): DeliveryContact & { suggested: DeliveryContact } {
  const suggested = suggestDeliveryContact(lines, order, customerPhone);
  return {
    address: order.delivery_address?.trim() || suggested.address,
    name: order.receiver_name?.trim() || suggested.name,
    phone: order.receiver_phone?.trim() || suggested.phone,
    suggested,
  };
}

// Trả hàng (CEO 2026-10-05): ô trên đơn → ghi chú dòng phí thu hồi → giống
// lúc giao. sameAsDelivery = đơn chưa điền ô trả hàng nào.
export function resolveReturnContact(
  order: Parameters<typeof resolveDeliveryContact>[0] & {
    return_address: string | null;
    return_contact_name: string | null;
    return_contact_phone: string | null;
  },
  lines: NoteLine[],
  customerPhone: string | null = null,
): DeliveryContact & { sameAsDelivery: boolean } {
  const delivery = resolveDeliveryContact(order, lines, customerPhone);
  const lineAddr =
    lines
      .filter((l) => l.equipment_type_id && COLLECTION_FEE_TYPE_IDS.has(l.equipment_type_id))
      .map(lineAddress)
      .find(Boolean) ?? null;
  return {
    address: order.return_address?.trim() || lineAddr || delivery.address,
    name: order.return_contact_name?.trim() || delivery.name,
    phone: order.return_contact_phone?.trim() || delivery.phone,
    sameAsDelivery: !(order.return_address || order.return_contact_name || order.return_contact_phone),
  };
}
