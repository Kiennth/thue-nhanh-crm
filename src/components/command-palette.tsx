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
      {/* CEO 10/10: "to thật là to để ai cũng biết mà ấn vô, màu sắc rực rỡ" —
          nút chiếm giữa thanh trên cùng, nền chuyển màu cam → hồng → tím,
          hiện cả trên điện thoại. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-3 text-left text-white shadow-lg shadow-rose-500/30 ring-2 ring-white/40 transition hover:brightness-110 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-rose-300 focus-visible:outline-none sm:h-12 sm:max-w-2xl sm:px-4"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/25 sm:size-8">
          <Search className="size-4 sm:size-5" strokeWidth={2.75} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-wide sm:text-base">
          TÌM NHANH
          <span className="hidden font-medium opacity-90 md:inline"> — mã đơn, tên khách, hàng hoá, trang…</span>
        </span>
        <kbd className="hidden shrink-0 rounded-md bg-white/25 px-2 py-0.5 font-mono text-xs font-semibold sm:block">Ctrl K</kbd>
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
