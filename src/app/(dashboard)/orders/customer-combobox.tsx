"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@/components/ui/combobox";
import { searchCustomers } from "@/lib/actions/customers";
import { QuickCustomerDialog } from "./quick-customer-dialog";

interface CustomerOption {
  value: string;
  label: string;
}

// Giá trị đặc biệt cho mục "Tạo khách hàng mới" chèn vào cuối danh sách kết
// quả tìm kiếm — mô phỏng nút "Create customer named 'X'" của Booqable.
const CREATE_VALUE = "__create__";

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
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");

  function handleInputValueChange(nextQuery: string) {
    setQuery(nextQuery);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!nextQuery.trim()) {
      setItems([]);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      startTransition(async () => {
        const results = await searchCustomers(nextQuery);
        setItems(results.map((c) => ({ value: c.id, label: c.name })));
      });
    }, 300);
  }

  const trimmedQuery = query.trim();
  const displayItems = trimmedQuery
    ? [...items, { value: CREATE_VALUE, label: `Tạo khách hàng mới "${trimmedQuery}"` }]
    : items;

  function handleValueChange(next: CustomerOption | null) {
    if (next?.value === CREATE_VALUE) {
      setCreateName(trimmedQuery);
      setCreateOpen(true);
      return;
    }
    setValue(next);
  }

  return (
    <>
      <Combobox
        items={displayItems}
        filter={null}
        value={value}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputValueChange}
        name={name}
      >
        <ComboboxInput placeholder="Gõ tên hoặc SĐT để tìm khách hàng..." />
        <ComboboxContent>
          <ComboboxEmpty>{pending ? "Đang tìm..." : "Không tìm thấy khách hàng."}</ComboboxEmpty>
          {displayItems.map((item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.value === CREATE_VALUE ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <Plus className="size-3.5 shrink-0" />
                  {item.label}
                </span>
              ) : (
                item.label
              )}
            </ComboboxItem>
          ))}
        </ComboboxContent>
      </Combobox>
      <QuickCustomerDialog
        key={createName}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={createName}
        onCreated={(customer) => {
          setValue(customer);
          setItems([customer]);
        }}
      />
    </>
  );
}
