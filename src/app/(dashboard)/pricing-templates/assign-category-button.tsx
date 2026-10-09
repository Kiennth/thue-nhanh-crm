"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignPricingTemplateToCategory } from "@/lib/actions/equipment";

// Gán 1 bảng giá mẫu cho cả danh mục (B3): mọi mã thuê tính theo bậc trong
// danh mục chuyển sang mẫu này; mã có thang giá riêng giữ nguyên. Đơn đã tạo
// không đổi giá.
export function AssignCategoryButton({
  templateId,
  categories,
}: {
  templateId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Áp cho danh mục
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm"
        aria-label="Danh mục"
      >
        <option value="">Chọn danh mục…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={!categoryId || pending}
        onClick={() =>
          startTransition(async () => {
            const res = await assignPricingTemplateToCategory(templateId, categoryId);
            if ("error" in res) return void toast.error(res.error);
            toast.success(res.count ? `Đã áp cho ${res.count} mã.` : "Các mã trong danh mục đã dùng mẫu này.");
            setOpen(false);
          })
        }
      >
        {pending ? "Đang áp…" : "Áp"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Đóng
      </Button>
    </div>
  );
}
