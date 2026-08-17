"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface RelatedOption {
  id: string;
  label: string;
}

// Chọn "Sản phẩm liên quan" gắn tay (CEO 2026-08-17): gõ tìm → bấm thêm →
// chip có nút xoá; thứ tự chip = thứ tự hiện trên web. Danh sách id đi theo
// form qua hidden input related_json khi bấm Lưu.
const MAX_RELATED = 8;

export function RelatedPicker({
  options,
  initialIds,
  selfId,
}: {
  options: RelatedOption[];
  initialIds: string[];
  selfId: string;
}) {
  const [ids, setIds] = useState<string[]>(initialIds);
  const [q, setQ] = useState("");

  const labelById = new Map(options.map((o) => [o.id, o.label]));
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const nq = norm(q.trim());
  const matches =
    nq.length >= 2
      ? options
          .filter((o) => o.id !== selfId && !ids.includes(o.id) && norm(o.label).includes(nq))
          .slice(0, 6)
      : [];

  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium"
            >
              {labelById.get(id) ?? "(đã xoá?)"}
              <button
                type="button"
                onClick={() => setIds((prev) => prev.filter((x) => x !== id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Bỏ liên quan"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {ids.length < MAX_RELATED && (
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gõ tên sản phẩm để thêm liên quan..."
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-background shadow-md">
              {matches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIds((prev) => [...prev, o.id]);
                      setQ("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hiện ở khối “Sản phẩm liên quan” trên web, tối đa {MAX_RELATED}. Khối “Tương đương” thì web tự lấy hàng cùng danh mục.
      </p>
      <input type="hidden" name="related_json" value={JSON.stringify(ids)} />
    </div>
  );
}
