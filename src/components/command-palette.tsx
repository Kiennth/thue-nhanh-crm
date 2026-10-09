"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Tìm nhanh Ctrl+K / Cmd+K (đề xuất CRM v2 §4.1, CEO 2026-10-09): gõ để nhảy
// tới trang trong menu, hoặc tìm thẳng mã đơn / tên khách / hàng hoá (mở
// trang danh sách với ô tìm đã điền). Không truy vấn gì thêm — chỉ điều hướng.
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

type Option = { key: string; label: string; hint: string; href: string };

export function CommandPalette({ pages }: { pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const options = useMemo<Option[]>(() => {
    const text = q.trim();
    const needle = fold(text);
    const pageHits = pages
      .filter((p) => !needle || fold(p.label).includes(needle))
      .slice(0, text ? 6 : 12)
      .map((p) => ({ key: `p:${p.href}`, label: p.label, hint: "Trang", href: p.href }));
    if (!text) return pageHits;
    const enc = encodeURIComponent(text);
    // Gõ giống mã đơn (PO13206, BQ12912, DH…) → tìm đơn lên đầu.
    const looksLikeOrder = /^(po|bq|dh|web)[-\s]?\d/i.test(text) || /^\d{4,}$/.test(text);
    const searches: Option[] = [
      { key: "s:orders", label: `Tìm đơn “${text}”`, hint: "Đơn hàng", href: `/orders?search=${enc}` },
      { key: "s:customers", label: `Tìm khách “${text}”`, hint: "Khách hàng", href: `/customers?search=${enc}` },
      { key: "s:equipment", label: `Tìm hàng hoá “${text}”`, hint: "Thiết bị", href: `/equipment?search=${enc}` },
    ];
    return looksLikeOrder ? [searches[0], ...pageHits, ...searches.slice(1)] : [...pageHits, ...searches];
  }, [q, pages]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    setOpen(false);
    setQ("");
    router.push(o.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:flex"
      >
        <Search className="size-4" />
        Tìm nhanh…
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">Ctrl K</kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQ("");
          setActive(0);
        }}
      >
        <DialogContent className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Tìm nhanh</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(options[active]);
                }
              }}
              placeholder="Gõ tên trang, mã đơn, tên khách, hàng hoá…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {options.map((o, i) => (
              <li key={o.key} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(o)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "",
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                  {i === active && <ArrowRight className="size-3.5 text-muted-foreground" />}
                </button>
              </li>
            ))}
            {!options.length && <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">Không thấy trang nào.</li>}
          </ul>
          <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">↑↓ chọn · Enter mở · Esc đóng</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
