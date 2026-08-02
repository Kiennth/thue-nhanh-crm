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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 12);
  }, [options, query]);

  function handlePick(option: QuickAddOption) {
    setError(null);
    const formData = new FormData();
    formData.set("order_id", orderId);
    formData.set("equipment_type_id", option.equipmentTypeId);
    if (option.equipmentUnitId) formData.set("equipment_unit_id", option.equipmentUnitId);
    if (option.equipmentInstanceId)
      formData.set("equipment_instance_id", option.equipmentInstanceId);
    formData.set("quantity", "1");
    startTransition(async () => {
      const result = await addOrderEquipmentLine(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setQuery("");
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
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Gõ tên hàng hoá để thêm nhanh vào đơn..."
          className="pl-8"
          disabled={pending}
        />
        {pending && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
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
                <span className="truncate">{o.label}</span>
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
