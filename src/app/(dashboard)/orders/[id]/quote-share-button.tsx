"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getQuoteSharePath } from "@/lib/actions/quote-share";

// "Link báo giá" (CEO 2026-10-04): gửi khách qua Zalo/email, khách xem báo
// giá + bấm Đồng ý → CRM tự hoàn thành khâu Chốt đơn.
export function QuoteShareButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !url)
          start(async () => {
            const r = await getQuoteSharePath(orderId);
            if (r.path) setUrl(`${window.location.origin}${r.path}`);
            else toast.error(r.error ?? "Không tạo được link");
          });
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Link2 className="size-4" />
            Link báo giá
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gửi link báo giá cho khách</DialogTitle>
          <DialogDescription>
            Khách mở link xem báo giá (không cần tài khoản), nhập tên và bấm “Đồng ý” — CRM tự hoàn thành khâu Chốt
            đơn và email báo bạn. Báo giá luôn theo số liệu mới nhất của đơn.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={pending ? "Đang tạo link..." : url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button
            type="button"
            disabled={!url}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Đã chép link báo giá");
              } catch {
                toast.error("Không chép được — bôi đen link rồi chép tay");
              }
            }}
          >
            <Copy className="size-4" />
            Chép
          </Button>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ExternalLink className="size-3.5" /> Mở thử như khách thấy
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
