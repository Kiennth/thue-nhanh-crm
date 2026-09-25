"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface ProductPickerOption {
  key: string;
  label: string;
}

// Ô gõ tên → chọn 1 sản phẩm (cùng kiểu ô "thêm nhanh" trên đơn), dùng cho
// khai báo món con combo và đổi món trong combo. onPick trả lỗi thì hiện ngay
// dưới ô.
export function ProductSearchPicker<T extends ProductPickerOption>({
  options,
  onPick,
  placeholder,
  loading = false,
  autoFocus = false,
}: {
  options: T[];
  onPick: (option: T) => Promise<{ error: string } | { success: true } | undefined>;
  placeholder: string;
  loading?: boolean;
  autoFocus?: boolean;
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

  function handlePick(option: T) {
    setError(null);
    startTransition(async () => {
      const result = await onPick(option);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setQuery("");
        setOpen(false);
      }
    });
  }

  const busy = pending || loading;

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
          placeholder={loading ? "Đang tải danh sách..." : placeholder}
          className="pl-8"
          disabled={busy}
          autoFocus={autoFocus}
        />
        {busy && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      {open && filtered.length > 0 && (
        <ul className="bg-popover absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border shadow-md">
          {filtered.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                className="hover:bg-muted flex w-full items-center px-2.5 py-1.5 text-left text-sm"
                onClick={() => handlePick(o)}
              >
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && !loading && (
        <p className="bg-popover text-muted-foreground absolute z-50 mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm shadow-md">
          Không tìm thấy sản phẩm nào.
        </p>
      )}
    </div>
  );
}
