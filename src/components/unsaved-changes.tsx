"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Thanh "Có thay đổi chưa lưu" (đề xuất CRM v2 §4.4, CEO 2026-10-09): các khối
// sửa trong trang chi tiết đơn tự báo mình đang có thay đổi chưa lưu
// (useUnsavedSection) → thanh cố định ở đáy liệt kê khối nào chưa lưu, nút
// "Lưu tất cả" (Ctrl/Cmd+S) gọi lưu từng khối, "Bỏ thay đổi" tải lại trang.
// Rời trang khi còn thay đổi: đóng tab/tải lại → trình duyệt hỏi; bấm link
// trong app → chặn lại, hỏi ngay trên thanh. Nút Lưu riêng từng khối vẫn giữ.

type Section = { label: string; save: () => void };
type Registry = { set: (key: string, section: Section | null) => void };

const UnsavedCtx = createContext<Registry | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sections, setSections] = useState<Record<string, Section>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const dirty = Object.keys(sections).length > 0;

  const set = useCallback((key: string, section: Section | null) => {
    setSections((prev) => {
      if (!section) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: section };
    });
  }, []);

  const saveAll = useCallback(() => {
    for (const s of Object.values(sections)) s.save();
    setLeaveHref(null);
  }, [sections]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // Bắt link trong app ở pha capture của window — chạy trước Next <Link>.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveHref(url.pathname + url.search + url.hash);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [dirty, saveAll]);

  const labels = Object.values(sections).map((s) => s.label);

  return (
    <UnsavedCtx.Provider value={{ set }}>
      {children}
      {dirty && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(100%-2rem,46rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm shadow-lg dark:border-amber-700 dark:bg-amber-950"
        >
          <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-100">
            {leaveHref ? (
              <b>Còn thay đổi chưa lưu — lưu trước khi rời trang?</b>
            ) : (
              <>
                <b>
                  Có {labels.length} phần chưa lưu
                </b>
                : {labels.join(", ")}
              </>
            )}
          </span>
          {leaveHref ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLeaveHref(null)}>
                Ở lại
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-background"
                onClick={() => {
                  const href = leaveHref;
                  setSections({});
                  setLeaveHref(null);
                  router.push(href);
                }}
              >
                Rời trang không lưu
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSections({});
                location.reload();
              }}
            >
              Bỏ thay đổi
            </Button>
          )}
          <Button type="button" size="sm" onClick={saveAll}>
            Lưu tất cả <span className="ml-1 hidden text-xs opacity-70 sm:inline">Ctrl+S</span>
          </Button>
        </div>
      )}
    </UnsavedCtx.Provider>
  );
}

// Khối sửa báo trạng thái "chưa lưu" + cách lưu. Ngoài Provider thì không làm gì.
export function useUnsavedSection(key: string, label: string, dirty: boolean, save: () => void) {
  const ctx = useContext(UnsavedCtx);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!ctx) return;
    ctx.set(key, dirty ? { label, save: () => saveRef.current() } : null);
    return () => ctx.set(key, null);
  }, [ctx, key, label, dirty]);
}

// Viền vàng cho khối đang có thay đổi chưa lưu.
export const UNSAVED_RING = "rounded-lg ring-2 ring-amber-300 ring-offset-4 ring-offset-background dark:ring-amber-700";
