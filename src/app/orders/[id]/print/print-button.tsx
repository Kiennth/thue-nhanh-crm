"use client";

import { useState, useTransition } from "react";
import { FileDown, FileEdit, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openInGoogleDocs } from "@/lib/actions/google-docs";
import { downloadWord } from "./word-export";

export interface GoogleDocsState {
  // Nút Google Docs chỉ hiện cho Giám đốc/Admin/Kế toán.
  canUse: boolean;
  // Chỉ Giám đốc được bấm "Kết nối Google Drive".
  canConnect: boolean;
  configured: boolean;
  connected: boolean;
  existingUrl: string | null;
  // Kết quả vừa kết nối (?google=...) để báo cho người dùng.
  notice: string | null;
  connectHref: string;
}

const NOTICES: Record<string, string> = {
  connected: "✅ Đã kết nối Google Drive — bấm \"Mở bằng Google Docs\".",
  denied: "Chưa kết nối: bạn đã bấm từ chối trên trang Google.",
  invalid: "Phiên kết nối hết hạn — bấm \"Kết nối Google Drive\" lại.",
  "no-refresh": "Google chưa cấp quyền lâu dài — bấm \"Kết nối Google Drive\" lại.",
  error: "Kết nối Google Drive lỗi — thử lại hoặc báo kỹ thuật.",
};

export function PrintButton({
  orderId,
  docType,
  google,
}: {
  orderId?: string;
  docType?: string;
  google?: GoogleDocsState;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(google?.existingUrl ?? null);

  // Mở tab trước (đúng lúc bấm, không bị chặn popup) rồi mới gán link khi
  // CRM tạo xong file — tạo lần đầu mất vài giây.
  function handleGoogleDocs(regenerate: boolean) {
    if (!orderId || !docType) return;
    setError(null);
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const r = await openInGoogleDocs(orderId, docType, regenerate);
      if ("error" in r) {
        tab?.close();
        setError(r.error);
        return;
      }
      setDocUrl(r.url);
      if (tab) tab.location.href = r.url;
      else window.location.href = r.url;
    });
  }

  return (
    <div data-no-export className="mb-6 space-y-2 print:hidden">
      <div className="flex flex-wrap justify-end gap-2">
        {google?.canUse && google.configured && google.connected && (
          <>
            <Button variant="outline" disabled={pending} onClick={() => handleGoogleDocs(false)}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <FileEdit className="size-4" />}
              {docUrl ? "Mở Google Docs" : "Mở bằng Google Docs"}
            </Button>
            {docUrl && (
              <Button
                variant="ghost"
                disabled={pending}
                title="Ghi đè file Google Docs bằng dữ liệu đơn mới nhất (mất chỗ đã sửa tay)"
                onClick={() => {
                  if (confirm("Tạo lại file Google Docs từ dữ liệu đơn mới nhất? Chỗ đã sửa tay trong file sẽ mất.")) {
                    handleGoogleDocs(true);
                  }
                }}
              >
                <RefreshCw className="size-4" />
                Tạo lại
              </Button>
            )}
          </>
        )}
        {google?.canConnect && google.configured && !google.connected && (
          <Button variant="outline" render={<a href={google.connectHref} />}>
            <FileEdit className="size-4" />
            Kết nối Google Drive
          </Button>
        )}
        {/* Tải Word để sửa tay (CEO 2026-10-04) — kéo file vào Google Drive
            là mở thành Google Docs. */}
        <Button
          variant="outline"
          onClick={() => {
            const root = document.querySelector<HTMLElement>("[data-doc-root]");
            if (root) downloadWord(root, document.title || "chung-tu");
          }}
        >
          <FileDown className="size-4" />
          Tải file Word
        </Button>
        {/* Tải PDF và In tách 2 nút (CEO 2026-10-04): PDF dựng ở server, tải
            thẳng về máy đúng tên file; In chỉ mở hộp thoại in. */}
        {orderId && docType && (
          <Button variant="outline" render={<a href={`/api/orders/${orderId}/pdf?type=${docType}`} />}>
            <FileText className="size-4" />
            Tải PDF
          </Button>
        )}
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          In
        </Button>
      </div>
      {google?.notice && NOTICES[google.notice] && (
        <p className="text-right text-sm text-muted-foreground">{NOTICES[google.notice]}</p>
      )}
      {error && <p className="text-right text-sm text-destructive">{error}</p>}
    </div>
  );
}
