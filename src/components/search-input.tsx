"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  paramName: string;
  placeholder: string;
  value: string;
  // Các URL param khác cần xoá khi đổi từ khoá tìm kiếm (vd "page", để quay
  // lại trang 1 thay vì đứng nguyên ở trang cũ với kết quả đã lọc khác).
  resetParams?: string[];
  className?: string;
}

// CEO 2026-09-22: không tìm ngay khi gõ (trước debounce 300ms) — chỉ tìm khi
// bấm Enter hoặc bấm nút kính lúp, để gõ hết từ khoá rồi mới tải lại trang.
export function SearchInput({
  paramName,
  placeholder,
  value,
  resetParams = [],
  className = "w-64",
}: SearchInputProps) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [text, setText] = useState(value);

  function submit() {
    const next = text.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (next === (searchParams.get(paramName) ?? "")) return;
    if (next) {
      params.set(paramName, next);
    } else {
      params.delete(paramName);
    }
    for (const p of resetParams) params.delete(p);
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <button
        type="submit"
        aria-label="Tìm kiếm"
        title="Tìm kiếm (Enter)"
        className="absolute top-1/2 left-1.5 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Search className="size-4" />
      </button>
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </form>
  );
}
