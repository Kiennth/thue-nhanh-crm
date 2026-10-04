"use client";

import { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
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

// Nút "Đăng ký lịch" (học nút Subscribe của Booqable): link iCal riêng của
// từng nhân viên, dán vào Google Calendar / iPhone để thấy lịch giao + thu
// hồi ngay trên điện thoại. Lịch điện thoại tự tải lại vài giờ/lần.
export function SubscribeButton({ url, branchName }: { url: string; branchName: string | null }) {
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã chép link lịch");
    } catch {
      toast.error("Không chép được — bôi đen link rồi chép tay");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CalendarPlus className="size-4" />
            Đăng ký lịch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xem lịch giao / thu hồi trên điện thoại</DialogTitle>
          <DialogDescription>
            Link riêng của bạn{branchName ? ` (kho ${branchName})` : " (tất cả kho)"} — đừng gửi cho người ngoài
            vì có tên và SĐT khách.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button type="button" onClick={copy}>
            <Copy className="size-4" />
            Chép
          </Button>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            <b>Google Calendar (máy tính):</b> bên trái bấm <b>+</b> cạnh “Lịch khác” → <b>Từ URL</b> → dán link →{" "}
            <b>Thêm lịch</b>. Điện thoại Android dùng chung tài khoản Google sẽ tự có.
          </p>
          <p>
            <b>iPhone:</b> Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → <b>Thêm lịch đã đăng ký</b> → dán
            link.
          </p>
          <p className="text-muted-foreground">
            Lịch gồm đơn từ 2 tuần trước đến 3 tháng tới; Google cập nhật vài giờ một lần nên đơn mới có thể hiện
            trễ.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
