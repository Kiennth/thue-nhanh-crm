"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isChunkError, reloadOnceForChunkError } from "@/components/chunk-reload";

// Lỗi trang: nếu do CRM vừa deploy bản mới (ChunkLoadError) thì tự tải lại;
// lỗi khác hiện nút tải lại thay cho màn "This page couldn't load".
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isChunkError(error)) reloadOnceForChunkError();
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">Trang chưa tải được</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Có thể CRM vừa cập nhật bản mới. Bấm tải lại; nếu vẫn lỗi, chụp màn hình gửi kỹ thuật.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
        <Button variant="outline" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
