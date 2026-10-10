"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Star, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  toggleProductFeatured,
  toggleProductNew,
  toggleProductPublished,
  refreshWebsiteNow,
} from "@/lib/actions/website";

const WEBSITE_BASE = "https://thuenhanh.vn";

export function WebsiteProductRowActions({
  id,
  slug,
  isPublished,
  isFeatured,
  isNew,
}: {
  id: string;
  slug: string;
  isPublished: boolean;
  isFeatured: boolean;
  isNew: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error: string } | { success: true } | undefined>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) toast.error(result.error);
      else toast.success(ok);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        title={isFeatured ? "Bỏ khỏi Thuê nhiều nhất" : "Đưa vào Thuê nhiều nhất"}
        onClick={() => run(() => toggleProductFeatured(id), "Đã cập nhật Thuê nhiều nhất.")}
      >
        <Star className={`size-4 ${isFeatured ? "fill-amber-400 text-amber-400" : ""}`} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        title={isNew ? "Bỏ khỏi Sản phẩm mới" : "Đưa vào Sản phẩm mới"}
        onClick={() => run(() => toggleProductNew(id), "Đã cập nhật Sản phẩm mới.")}
      >
        <Sparkles className={`size-4 ${isNew ? "fill-emerald-400 text-emerald-500" : ""}`} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        title={isPublished ? "Ẩn khỏi web" : "Hiện lên web"}
        onClick={() =>
          run(() => toggleProductPublished(id), isPublished ? "Đã ẩn khỏi web." : "Đã hiện lên web.")
        }
      >
        {isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      <a
        href={`${WEBSITE_BASE}/${slug}`}
        target="_blank"
        rel="noopener"
        title="Xem trên web"
        className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
      >
        <ExternalLink className="size-4" />
      </a>
    </div>
  );
}

// Hỏi lại trước khi làm mới (đề xuất CRM v2 §4.7): nút này KHÔNG đăng gì
// mới — thay đổi đã tự lên web khi bấm Lưu; nó xoá bộ nhớ đệm toàn site nên
// vài phút đầu web chậm hơn. Nói rõ để khỏi bấm khi không cần.
export function RefreshWebsiteButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={pending}>
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
            Cập nhật web ngay
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Làm mới toàn bộ web?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Thay đổi đã lưu vốn tự lên web sau khi bấm Lưu — thường không cần nút này.</p>
          <p>
            Chỉ bấm khi web vẫn hiện nội dung cũ sau vài phút. Web sẽ xoá bộ nhớ đệm mọi trang, nên vài phút đầu
            khách mở trang sẽ chậm hơn.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Đóng
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await refreshWebsiteNow();
                if (result && "error" in result) toast.error(result.error);
                else toast.success("Web đang làm mới nội dung.");
                setOpen(false);
              })
            }
          >
            {pending ? "Đang làm mới..." : "Làm mới web"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
