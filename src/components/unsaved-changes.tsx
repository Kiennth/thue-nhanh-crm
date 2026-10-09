"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// MỘT thanh "Lưu thay đổi" cho trang chi tiết đơn (B1, Grok CRM 09/10 — trước
// là đề xuất v2 §4.4): các khối / ô sửa trên dòng hàng báo mình đang có thay
// đổi (useUnsavedSection) và KHÔNG còn nút "Lưu" riêng. Thanh tối cố định ở
// đáy: "Có N thay đổi chưa lưu" + tóm tắt, "Bỏ thay đổi" · "Lưu thay đổi"
// (Ctrl/Cmd+S) — lưu lần lượt từng khối. Rời trang khi còn thay đổi: đóng tab
// → trình duyệt hỏi; bấm link trong app → hỏi ngay trên thanh. Nút hành động
// riêng (Chốt đơn, Ghi nhận thu tiền, Gửi email, Tạo chứng từ — gắn
// data-requires-saved) bấm khi còn thay đổi → "Lưu N thay đổi trước?".

type Section = { label: string; save: () => void };
type Registry = { set: (key: string, section: Section | null) => void };

const UnsavedCtx = createContext<Registry | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sections, setSections] = useState<Record<string, Section>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  // Nút hành động đang chờ lưu xong để bấm tiếp.
  const pendingAction = useRef<HTMLElement | null>(null);
  const [askAction, setAskAction] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const count = Object.keys(sections).length;
  const dirty = count > 0;
  // Lưu xong (mọi khối hết "chưa lưu") → tắt trạng thái đang lưu.
  const [prevDirty, setPrevDirty] = useState(dirty);
  if (prevDirty !== dirty) {
    setPrevDirty(dirty);
    if (!dirty) setSaving(false);
  }

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
    setSaving(true);
    for (const s of Object.values(sections)) s.save();
    setLeaveHref(null);
  }, [sections]);

  // Đang chờ để bấm tiếp nút hành động thì lưu xong bấm luôn.
  useEffect(() => {
    if (dirty || !pendingAction.current) return;
    const el = pendingAction.current;
    pendingAction.current = null;
    el.click();
  }, [dirty]);

  // Khối báo lỗi (không lưu được) thì vẫn "chưa lưu" — nhả nút sau 15 giây.
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => setSaving(false), 15_000);
    return () => clearTimeout(t);
  }, [saving]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // Bắt link trong app + nút hành động ở pha capture của window — chạy
    // trước Next <Link> và onClick của nút.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const guarded = target?.closest?.("[data-requires-saved]") as HTMLElement | null;
      if (guarded) {
        e.preventDefault();
        e.stopPropagation();
        setAskAction(guarded);
        return;
      }
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveHref(url.pathname + url.search + url.hash);
    };
    // Menu/nút mở theo pointerdown (vd. menu In chứng từ) — chặn luôn để chỉ
    // còn cú click ở trên quyết định.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-requires-saved]")) e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [dirty, saveAll]);

  // Giữ nguyên object context giữa các lần render — không thì mọi khối đăng
  // ký lại liên tục (vòng lặp render).
  const registry = useMemo(() => ({ set }), [set]);
  const labels = Object.values(sections).map((s) => s.label);
  const summary =
    labels.slice(0, 3).join(" · ") + (labels.length > 3 ? ` · +${labels.length - 3} thay đổi khác` : "");

  return (
    <UnsavedCtx.Provider value={registry}>
      {children}
      {dirty && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(100%-2rem,52rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-2xl dark:bg-zinc-800"
        >
          <span className="min-w-0 flex-1">
            {leaveHref ? (
              <b>Bạn có {count} thay đổi chưa lưu.</b>
            ) : askAction ? (
              <b>Lưu {count} thay đổi trước?</b>
            ) : (
              <>
                <b className="text-amber-300">● Có {count} thay đổi chưa lưu</b>
                <span className="block truncate text-xs text-white/70">{summary}</span>
              </>
            )}
          </span>
          {leaveHref ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setLeaveHref(null)}>
                Ở lại
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={() => {
                  const href = leaveHref;
                  setSections({});
                  setLeaveHref(null);
                  router.push(href);
                }}
              >
                Rời trang, bỏ thay đổi
              </Button>
            </>
          ) : askAction ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setAskAction(null)}>
                Đóng
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => {
                  pendingAction.current = askAction;
                  setAskAction(null);
                  saveAll();
                }}
              >
                {saving && <Loader2 className="animate-spin" />} Lưu và tiếp tục
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                disabled={saving}
                onClick={() => {
                  setSections({});
                  location.reload();
                }}
              >
                Bỏ thay đổi
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={saveAll}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" /> Đang lưu…
                  </>
                ) : (
                  <>
                    Lưu thay đổi <span className="ml-1 hidden text-xs opacity-70 sm:inline">Ctrl+S</span>
                  </>
                )}
              </Button>
            </>
          )}
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

// Viền vàng + nền vàng nhạt cho khối/ô đang có thay đổi chưa lưu.
export const UNSAVED_RING =
  "rounded-lg bg-[#FFFBEB] ring-2 ring-amber-300 ring-offset-4 ring-offset-background dark:bg-amber-950/30 dark:ring-amber-700";

// Nhãn nhỏ "● đã sửa" cạnh khối đang sửa.
export function EditedTag() {
  return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">● đã sửa</span>;
}
