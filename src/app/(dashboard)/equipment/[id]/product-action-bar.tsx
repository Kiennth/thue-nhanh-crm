"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Flame, Loader2, PlayCircle, Rocket, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  deleteEquipmentType,
  getEquipmentTypeDeleteCheck,
  setEquipmentTypeDiscontinued,
  setEquipmentTypeUnreleased,
  setEquipmentWebFlags,
} from "@/lib/actions/equipment";

// Thanh thao tác ngay dưới tên mã hàng (B8, Grok CRM 09/10 — CEO duyệt):
// Sửa · Xoá · Ngừng kinh doanh ↔ Kinh doanh lại · Sắp ra mắt (+ ngày dự kiến),
// và nhóm "NHÃN WEB" riêng bên phải: Thuê nhiều (website_products.is_featured)
// · Hàng mới (is_new). Ngừng kinh doanh: ẩn khỏi web + ô chọn hàng, tắt Sắp ra
// mắt, khoá 2 nhãn (giữ giá trị). "Đặt trước" trên web CHỈ đến từ Sắp ra mắt.
export function ProductActionBar({
  id,
  name,
  discontinuedAt,
  discontinuedByName,
  isUnreleased,
  launchDate,
  web,
  editButton,
}: {
  id: string;
  name: string;
  discontinuedAt: string | null;
  discontinuedByName: string | null;
  isUnreleased: boolean;
  launchDate: string | null;
  // null = mã chưa có trang trên web → 2 nhãn web không bật được.
  web: { featured: boolean; isNew: boolean } | null;
  editButton: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmStop, setConfirmStop] = useState(false);
  const [deleteState, setDeleteState] = useState<
    null | { canDelete: true } | { canDelete: false; orderCount: number; machineCount: number }
  >(null);
  const [understood, setUnderstood] = useState(false);
  const discontinued = !!discontinuedAt;

  const run = (fn: () => Promise<{ error?: string } | { success: true }>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      after?.();
      // Không router.refresh(): server action đã revalidatePath trang này nên
      // phản hồi kèm sẵn trang mới — refresh thêm là dựng trang 2 lần (~4 giây).
    });

  const stop = () =>
    run(() => setEquipmentTypeDiscontinued(id, true), "Đã ngừng kinh doanh.", () => {
      setConfirmStop(false);
      setDeleteState(null);
    });

  const toggleFlag = (key: "featured" | "isNew", next: boolean) => {
    const label = key === "featured" ? "Thuê nhiều" : "Hàng mới";
    startTransition(async () => {
      const res = await setEquipmentWebFlags(id, { [key]: next });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? `Đã bật nhãn ${label}` : `Đã tắt nhãn ${label}`, {
        duration: 5000,
        action: {
          label: "Hoàn tác",
          onClick: () => {
            void setEquipmentWebFlags(id, { [key]: !next });
          },
        },
      });
    });
  };

  const openDelete = () =>
    startTransition(async () => {
      const res = await getEquipmentTypeDeleteCheck(id);
      setUnderstood(false);
      setDeleteState(
        res.canDelete ? { canDelete: true } : { canDelete: false, orderCount: res.orderCount, machineCount: res.machineCount },
      );
    });

  const doDelete = () =>
    startTransition(async () => {
      try {
        await deleteEquipmentType(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoá được.");
        return;
      }
      toast.success(`Đã xoá "${name}".`);
      router.push("/equipment");
    });

  const lockedHint = "Sản phẩm đã ngừng kinh doanh";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2.5">
        {editButton}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={openDelete}
          className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          <Trash2 /> Xoá
        </Button>
        {discontinued ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setEquipmentTypeDiscontinued(id, false), "Đã kinh doanh lại.")}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            <PlayCircle /> Kinh doanh lại
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmStop(true)}
            className="border-amber-400 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            <Ban /> Ngừng kinh doanh
          </Button>
        )}
        <span
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium",
            isUnreleased ? "border-violet-400 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "text-violet-700 dark:text-violet-300",
            discontinued && "opacity-50",
          )}
          title={discontinued ? lockedHint : "Bật = web hiện nhãn Đặt trước"}
        >
          <button
            type="button"
            role="switch"
            aria-checked={isUnreleased}
            disabled={pending || discontinued}
            onClick={() =>
              run(
                () => setEquipmentTypeUnreleased(id, !isUnreleased, launchDate),
                isUnreleased ? "Đã tắt Sắp ra mắt." : "Đã bật Sắp ra mắt — web hiện nhãn Đặt trước.",
              )
            }
            className="inline-flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Rocket className="size-4" />
            Sắp ra mắt
            <span
              className={cn(
                "relative h-4 w-7 rounded-full transition-colors",
                isUnreleased ? "bg-violet-600" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-3 rounded-full bg-white transition-all",
                  isUnreleased ? "left-3.5" : "left-0.5",
                )}
              />
            </span>
          </button>
          {isUnreleased && (
            <input
              type="date"
              aria-label="Ngày dự kiến ra mắt (tuỳ chọn)"
              title="Ngày dự kiến ra mắt (tuỳ chọn) — đến ngày CRM chỉ nhắc, không tự tắt"
              defaultValue={launchDate ?? ""}
              disabled={pending}
              onChange={(e) =>
                run(
                  () => setEquipmentTypeUnreleased(id, true, e.target.value || null),
                  e.target.value ? "Đã lưu ngày dự kiến ra mắt." : "Đã bỏ ngày dự kiến.",
                )
              }
              className="h-6 rounded border bg-background px-1 text-xs"
            />
          )}
        </span>

        {/* Nhãn web — tách riêng bên phải. */}
        <span className="ml-auto flex flex-wrap items-center gap-2 border-l pl-3">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Nhãn web</span>
          {(
            [
              { key: "featured", label: "Thuê nhiều", on: !!web?.featured, icon: Flame, onCls: "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
              { key: "isNew", label: "Hàng mới", on: !!web?.isNew, icon: Sparkles, onCls: "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
            ] as const
          ).map((c) => (
            <button
              key={c.key}
              type="button"
              role="switch"
              aria-checked={c.on}
              disabled={pending || discontinued || !web}
              title={discontinued ? lockedHint : !web ? "Mã này chưa có trang trên web" : undefined}
              onClick={() => toggleFlag(c.key, !c.on)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                c.on ? c.onCls : "border-dashed text-muted-foreground hover:text-foreground",
              )}
            >
              <c.icon className="size-4" />
              {c.label}
            </button>
          ))}
        </span>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {discontinued && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <span>
            Đã ngừng kinh doanh từ {new Date(discontinuedAt).toLocaleDateString("vi-VN")}
            {discontinuedByName ? ` · ${discontinuedByName}` : ""}. Đã ẩn khỏi website và khỏi ô chọn hàng khi tạo
            đơn; đơn cũ, công nợ, hoa hồng giữ nguyên. Nhãn Thuê nhiều / Hàng mới bị khoá (giữ giá trị cũ).
          </span>
        </p>
      )}

      {/* Hộp xác nhận Ngừng kinh doanh */}
      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ngừng kinh doanh &quot;{name}&quot;?</DialogTitle>
            <DialogDescription>
              Sản phẩm sẽ ẩn khỏi website và khỏi danh mục tạo đơn; lịch sử giữ nguyên. Bấm &quot;Kinh doanh lại&quot;
              để mở lại bất cứ lúc nào.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStop(false)}>
              Đóng
            </Button>
            <Button disabled={pending} onClick={stop} className="bg-amber-600 text-white hover:bg-amber-700">
              <Ban /> Ngừng kinh doanh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hộp Xoá: chưa có đơn → xác nhận; có đơn / còn máy → không cho xoá */}
      <Dialog open={!!deleteState} onOpenChange={(o) => !o && setDeleteState(null)}>
        <DialogContent>
          {deleteState?.canDelete ? (
            <>
              <DialogHeader>
                <DialogTitle>Xoá &quot;{name}&quot;?</DialogTitle>
                <DialogDescription>
                  Mã hàng chưa có đơn nào. Xoá sẽ gỡ sản phẩm khỏi CRM và website. Thao tác được ghi vào Nhật ký hoạt
                  động.
                </DialogDescription>
              </DialogHeader>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                Tôi hiểu thao tác này không hoàn tác được
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteState(null)}>
                  Đóng
                </Button>
                <Button variant="destructive" disabled={!understood || pending} onClick={doDelete}>
                  <Trash2 /> Xoá sản phẩm
                </Button>
              </DialogFooter>
            </>
          ) : deleteState ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TriangleAlert className="size-5 text-amber-500" /> Không thể xoá &quot;{name}&quot;
                </DialogTitle>
                <DialogDescription>
                  {deleteState.orderCount
                    ? `Sản phẩm đã có ${deleteState.orderCount} đơn (lịch sử thuê, công nợ, hoa hồng). Xoá sẽ làm mất lịch sử nên CRM không cho phép.`
                    : `Còn ${deleteState.machineCount} máy thuộc mã này — xoá mã sẽ xoá luôn các máy đó nên CRM không cho phép.`}{" "}
                  Dùng <b>Ngừng kinh doanh</b>: ẩn khỏi website và đơn mới, giữ toàn bộ lịch sử, mở lại được bất cứ lúc
                  nào.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteState(null)}>
                  Đóng
                </Button>
                {!discontinued && (
                  <Button disabled={pending} onClick={stop} className="bg-amber-600 text-white hover:bg-amber-700">
                    <Ban /> Ngừng kinh doanh
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
