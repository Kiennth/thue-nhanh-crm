"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { uploadEmployeeAvatar } from "@/lib/actions/employees";

// Ảnh đại diện tròn; ai được sửa thì rê vào hiện nút máy ảnh để đổi ảnh.
export function AvatarUpload({
  employeeId,
  url,
  initials,
  gradient,
  editable,
}: {
  employeeId: string;
  url: string | null;
  initials: string;
  gradient: string;
  editable: boolean;
}) {
  const [src, setSrc] = useState(url);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="group relative size-28 shrink-0 rounded-full bg-background p-1 shadow-xl">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ Supabase Storage
        <img src={src} alt="Ảnh đại diện" className="size-full rounded-full object-cover" />
      ) : (
        <div
          className="flex size-full items-center justify-center rounded-full text-3xl font-black text-white"
          style={{ background: gradient }}
        >
          {initials}
        </div>
      )}
      {editable && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="absolute inset-1 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Đổi ảnh đại diện"
          >
            <Camera className="size-6" />
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("avatar", file);
              start(async () => {
                const r = await uploadEmployeeAvatar(employeeId, fd);
                if ("error" in r) toast.error(r.error);
                else {
                  setSrc(r.url);
                  toast.success("Đã đổi ảnh đại diện");
                }
              });
            }}
          />
        </>
      )}
    </div>
  );
}
