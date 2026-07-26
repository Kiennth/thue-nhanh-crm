"use client";

import { useRef, useState } from "react";
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(next: string) {
    setText(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) {
        params.set(paramName, next.trim());
      } else {
        params.delete(paramName);
      }
      for (const p of resetParams) params.delete(p);
      const query = params.toString();
      start();
      router.push(query ? `${pathname}?${query}` : pathname);
    }, 300);
  }

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}
