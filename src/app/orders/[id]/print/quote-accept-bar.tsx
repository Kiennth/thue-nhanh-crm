"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { acceptQuote } from "@/lib/actions/quote-share";

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Thanh trên đầu báo giá khi khách mở link (CEO 2026-10-04): gõ tên → Đồng
// ý. Không in ra giấy/PDF (print:hidden).
export function QuoteAcceptBar({
  token,
  acceptedAt,
  acceptedName,
  cancelled,
}: {
  token: string;
  acceptedAt: string | null;
  acceptedName: string | null;
  cancelled: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; at: string } | null>(
    acceptedAt ? { name: acceptedName ?? "", at: acceptedAt } : null,
  );
  const [pending, start] = useTransition();

  const box =
    "mb-6 rounded-lg border p-4 font-sans text-sm print:hidden" +
    " [font-family:ui-sans-serif,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]";

  if (done) {
    return (
      <div className={`${box} flex flex-wrap items-center justify-between gap-3 border-emerald-300 bg-emerald-50 text-emerald-800`}>
        <span className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5" />
          Đã xác nhận đồng ý báo giá{done.name ? ` — ${done.name}` : ""} · {timeFmt.format(new Date(done.at))}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-medium"
        >
          <Printer className="size-4" /> In / Lưu PDF
        </button>
      </div>
    );
  }

  if (cancelled) {
    return <div className={`${box} border-neutral-300 bg-neutral-50`}>Báo giá này đã huỷ. Vui lòng liên hệ Thuê Nhanh 0888 441 886.</div>;
  }

  return (
    <div className={`${box} border-rose-200 bg-rose-50`}>
      <p className="font-semibold text-neutral-900">Quý khách xem kỹ báo giá bên dưới. Đồng ý thì nhập họ tên và bấm “Đồng ý báo giá”.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Họ tên người xác nhận"
          className="h-9 min-w-56 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-rose-500"
        />
        <button
          type="button"
          disabled={pending || name.trim().length < 2}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acceptQuote(token, name);
              if (r.error) setError(r.error);
              else setDone({ name: name.trim(), at: new Date().toISOString() });
            })
          }
          className="h-9 rounded-md bg-rose-600 px-4 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Đang gửi..." : "Đồng ý báo giá"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-9 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 font-medium"
        >
          <Printer className="size-4" /> In / Lưu PDF
        </button>
      </div>
      {error && <p className="mt-2 text-rose-700">{error}</p>}
    </div>
  );
}
