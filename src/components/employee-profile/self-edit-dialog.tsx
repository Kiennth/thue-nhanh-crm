"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/date-input";
import { updateMyProfile } from "@/lib/actions/employees";
import type { ProfileInfo } from "@/lib/employee-profile-data";

// Nhân viên tự sửa hồ sơ (không gồm SĐT công ty, CCCD, ghi chú nội bộ).
export function SelfEditDialog({ profile, birthday }: { profile: ProfileInfo | null; birthday: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const p = profile;
  const field = (name: keyof ProfileInfo, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`me_${name}`}>{label}</Label>
      <Input id={`me_${name}`} name={name} defaultValue={p?.[name] ?? ""} placeholder={placeholder} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Pencil className="size-4" />
            Sửa hồ sơ của tôi
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form
          action={(fd) =>
            start(async () => {
              const r = await updateMyProfile(undefined, fd);
              if (r && "error" in r) toast.error(r.error);
              else {
                toast.success("Đã lưu hồ sơ");
                setOpen(false);
              }
            })
          }
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Sửa hồ sơ của tôi</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="me_bio">Giới thiệu ngắn</Label>
            <Textarea
              id="me_bio"
              name="bio"
              rows={3}
              maxLength={500}
              defaultValue={p?.bio ?? ""}
              placeholder="Vài dòng về bạn: sở trường, sở thích, câu cửa miệng..."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="me_birthday">Ngày sinh</Label>
              <DateInput id="me_birthday" name="birthday" defaultValue={birthday ?? ""} />
            </div>
            {field("personal_phone", "SĐT cá nhân")}
            {field("facebook_url", "Facebook", "facebook.com/...")}
            {field("address", "Địa chỉ")}
          </div>
          <p className="text-sm font-semibold">Liên lạc khẩn cấp</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("emergency_name", "Họ tên")}
            {field("emergency_relation", "Quan hệ", "Bố, mẹ, vợ/chồng...")}
            {field("emergency_phone", "SĐT")}
          </div>
          <p className="text-xs text-muted-foreground">SĐT công ty và CCCD do Giám đốc cập nhật.</p>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
