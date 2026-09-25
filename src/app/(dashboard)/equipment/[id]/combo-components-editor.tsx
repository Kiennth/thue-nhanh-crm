"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductSearchPicker } from "@/components/product-search-picker";
import { addComboComponent, updateComboComponentQuantity } from "@/lib/actions/equipment";

// Thêm món con cho combo: chọn số lượng trước, gõ tên sản phẩm rồi chọn là
// thêm luôn (chọn lại món đã có thì cộng dồn số lượng).
export function AddComboComponentForm({
  comboTypeId,
  options,
}: {
  comboTypeId: string;
  options: { key: string; label: string }[];
}) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
        className="h-9 w-20"
        aria-label="Số lượng mỗi bộ"
      />
      <div className="min-w-64 flex-1">
        <ProductSearchPicker
          options={options}
          placeholder="Gõ tên sản phẩm để thêm vào combo..."
          onPick={async (option) => {
            const formData = new FormData();
            formData.set("component_type_id", option.key);
            formData.set("quantity", String(quantity));
            const result = await addComboComponent(comboTypeId, undefined, formData);
            if (!result || !("error" in result)) setQuantity(1);
            return result;
          }}
        />
      </div>
    </div>
  );
}

export function ComboComponentQuantityForm({
  componentId,
  quantity,
}: {
  componentId: string;
  quantity: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateComboComponentQuantity(componentId, undefined, formData);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-1">
      <Input
        key={quantity}
        name="quantity"
        type="number"
        min={1}
        defaultValue={quantity}
        className="h-8 w-16"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
