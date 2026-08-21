"use client";

import { useTransition } from "react";
import { Eye, EyeOff, Star, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  toggleProductFeatured,
  toggleProductNew,
  toggleProductPublished,
  refreshWebsiteNow,
} from "@/lib/actions/website";

const WEBSITE_BASE = "https://new.thuenhanh.vn";

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

export function RefreshWebsiteButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshWebsiteNow();
          if (result && "error" in result) toast.error(result.error);
          else toast.success("Web đang làm mới nội dung.");
        })
      }
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      Cập nhật web ngay
    </Button>
  );
}
