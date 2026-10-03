"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addOrderEquipmentLine } from "@/lib/actions/orders";

// Một lựa chọn thêm nhanh — đã "trải phẳng" sẵn từ server: loại nhiều biến
// thể thành 1 dòng/biến thể, hàng theo dõi riêng lẻ thành 1 dòng/máy sẵn có,
// còn lại 1 dòng/loại (server tự lo biến thể mặc định).
export interface QuickAddOption {
  key: string;
  label: string;
  imageUrl: string | null;
  equipmentTypeId: string;
  equipmentUnitId?: string;
  equipmentInstanceId?: string;
  // Ghi chú nhỏ bên phải (vd "12 máy ở kho giao").
  hint?: string;
  // Lựa chọn từng máy serial: chỉ hiện khi từ khoá khớp serial/biến thể.
  serialMatch?: string;
}

// Học theo ô "Search to add products" của Booqable: gõ tên ngay trên bảng
// thiết bị → chọn → dòng hàng vào luôn, không phải mở dialog. Dialog "Thêm
// dòng hàng" vẫn giữ cho dòng tự do/phụ phí.
export function QuickAddProductSearch({
  orderId,
  options,
}: {
  orderId: string;
  options: QuickAddOption[];
}) {
  const [query, setQuery] = useState("");
  // Số lượng thêm 1 lần — hàng serial: hệ thống tự lấy đủ số máy rảnh.
  const [quantity, setQuantity] = useState(1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) =>
        o.serialMatch ? o.serialMatch.toLowerCase().includes(q) : o.label.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [options, query]);

  function handlePick(option: QuickAddOption) {
    setError(null);
    const formData = new FormData();
    formData.set("order_id", orderId);
    formData.set("equipment_type_id", option.equipmentTypeId);
    if (option.equipmentUnitId) formData.set("equipment_unit_id", option.equipmentUnitId);
    if (option.equipmentInstanceId)
      formData.set("equipment_instance_id", option.equipmentInstanceId);
    formData.set("quantity", option.equipmentInstanceId ? "1" : String(quantity));
    startTransition(async () => {
      const result = await addOrderEquipmentLine(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setQuery("");
        setQuantity(1);
        setOpen(false);
      }
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setError(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                handlePick(filtered[0]);
              }
            }}
            placeholder="Gõ tên hàng (hoặc serial) để thêm vào đơn — Enter chọn dòng đầu..."
            className="pl-8"
            disabled={pending}
          />
          {pending && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-20"
          aria-label="Số lượng"
          title="Số lượng thêm (máy serial: tự lấy đủ số máy rảnh)"
          disabled={pending}
        />
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      {open && filtered.length > 0 && (
        <ul className="bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border shadow-md">
          {filtered.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                className="hover:bg-muted flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm"
                onClick={() => handlePick(o)}
              >
                {o.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh Supabase storage, cùng convention trang thiết bị
                  <img
                    src={o.imageUrl}
                    alt=""
                    className="size-6 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="bg-muted size-6 shrink-0 rounded" />
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-muted-foreground shrink-0 text-xs">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <p className="bg-popover text-muted-foreground absolute z-20 mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm shadow-md">
          Không tìm thấy hàng hoá nào.
        </p>
      )}
    </div>
  );
}
