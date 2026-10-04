"use client";

import { useEffect } from "react";

// Sau mỗi lần deploy, tab mở từ trước sẽ xin file code (chunk) của bản cũ đã
// bị thay → "This page couldn't load" (ChunkLoadError). Tự tải lại trang 1
// lần để lấy bản mới (CEO gặp 2026-10-04). Chặn lặp: mỗi 30 giây tối đa 1 lần.
export function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
  return /ChunkLoadError|Failed to load chunk|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(msg);
}

export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  } catch {
    // sessionStorage bị chặn — vẫn thử tải lại 1 lần.
  }
  window.location.reload();
  return true;
}

export function ChunkReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.error ?? e.message)) reloadOnceForChunkError();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkError(e.reason)) reloadOnceForChunkError();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
