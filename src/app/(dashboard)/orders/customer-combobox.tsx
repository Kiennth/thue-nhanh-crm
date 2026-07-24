"use client";

import { useRef, useState, useTransition } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@/components/ui/combobox";
import { searchCustomers } from "@/lib/actions/customers";

interface CustomerOption {
  value: string;
  label: string;
}

export function CustomerCombobox({
  name,
  defaultCustomer,
}: {
  name: string;
  defaultCustomer?: { id: string; name: string };
}) {
  const initial = defaultCustomer ? { value: defaultCustomer.id, label: defaultCustomer.name } : null;
  const [items, setItems] = useState<CustomerOption[]>(initial ? [initial] : []);
  const [value, setValue] = useState<CustomerOption | null>(initial);
  const [pending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInputValueChange(query: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!query.trim()) {
      setItems([]);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      startTransition(async () => {
        const results = await searchCustomers(query);
        setItems(results.map((c) => ({ value: c.id, label: c.name })));
      });
    }, 300);
  }

  return (
    <Combobox
      items={items}
      filter={null}
      value={value}
      onValueChange={setValue}
      onInputValueChange={handleInputValueChange}
      name={name}
    >
      <ComboboxInput placeholder="Gõ tên hoặc SĐT để tìm khách hàng..." />
      <ComboboxContent>
        <ComboboxEmpty>{pending ? "Đang tìm..." : "Không tìm thấy khách hàng."}</ComboboxEmpty>
        {items.map((item) => (
          <ComboboxItem key={item.value} value={item}>
            {item.label}
          </ComboboxItem>
        ))}
      </ComboboxContent>
    </Combobox>
  );
}
