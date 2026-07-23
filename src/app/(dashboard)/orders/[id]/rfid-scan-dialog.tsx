"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordRfidScanBatch, type RfidScanResult } from "@/lib/actions/rfid";
import { RFID_SCAN_TYPE_LABELS } from "@/lib/rfid-labels";
import type { RfidScanType } from "@/types/database";

interface RfidScanDialogProps {
  trigger: React.ReactElement;
  orderId: string;
  branchId: string;
  scanType: RfidScanType;
}

export function RfidScanDialog({ trigger, orderId, branchId, scanType }: RfidScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [tagCode, setTagCode] = useState("");
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const [result, setResult] = useState<RfidScanResult | null>(null);
  const [pending, startTransition] = useTransition();

  function addCode() {
    const code = tagCode.trim();
    if (!code) return;
    setScannedCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setTagCode("");
  }

  function handleConfirm() {
    if (scannedCodes.length === 0) {
      toast.error("Chưa quét tag nào.");
      return;
    }
    startTransition(async () => {
      const res = await recordRfidScanBatch(orderId, scanType, branchId, scannedCodes);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      setScannedCodes([]);
      toast.success(`Đã ghi nhận ${res.matchedCount} tag.`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setResult(null);
          setScannedCodes([]);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quét RFID — {RFID_SCAN_TYPE_LABELS[scanType]}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Quét hoặc nhập mã tag rồi Enter"
            value={tagCode}
            onChange={(e) => setTagCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCode();
              }
            }}
            autoFocus
          />
          <Button type="button" variant="outline" onClick={addCode} disabled={!tagCode.trim()}>
            Thêm
          </Button>
        </div>

        {scannedCodes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {scannedCodes.map((code) => (
              <span key={code} className="rounded-full border px-2 py-0.5 font-mono text-xs">
                {code}
              </span>
            ))}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p>Đã nhận diện {result.matchedCount} tag.</p>
            {result.unmatchedCodes.length > 0 && (
              <p className="text-destructive">
                Không tìm thấy tag: {result.unmatchedCodes.join(", ")}
              </p>
            )}
            <div className="space-y-1">
              {result.lines.map((line, i) => (
                <div
                  key={i}
                  className={`flex justify-between ${
                    line.scanned < line.expected ? "text-destructive" : ""
                  }`}
                >
                  <span>{line.label}</span>
                  <span>
                    {line.scanned}/{line.expected}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || scannedCodes.length === 0}
          >
            {pending ? "Đang xử lý..." : `Xác nhận quét (${scannedCodes.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
