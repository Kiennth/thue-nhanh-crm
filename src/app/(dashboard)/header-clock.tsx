"use client";

import { useEffect, useState } from "react";
import { VN_TIME_ZONE } from "@/lib/date-format";

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: VN_TIME_ZONE,
});

// Client component vì cần tick mỗi giây — Server Component chỉ render 1 lần
// lúc load trang, không tự cập nhật được. Luôn hiện giờ Hà Nội (không phải
// giờ máy người dùng) để nhất quán với giờ server ghi trên toàn hệ thống,
// xem lib/date-format.ts.
export function HeaderClock({ location }: { location: string | null }) {
  // now = null ở lần render đầu (server + client trước khi mount) để tránh
  // hydration mismatch — giờ "bây giờ" của server và client luôn lệch nhau
  // vài trăm ms trở lên, React sẽ báo lỗi nếu render thẳng ngay từ đầu.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <span className="text-muted-foreground font-mono text-xs">
      {timeFormatter.format(now)}
      {location ? ` · ${location}` : ""}
    </span>
  );
}
