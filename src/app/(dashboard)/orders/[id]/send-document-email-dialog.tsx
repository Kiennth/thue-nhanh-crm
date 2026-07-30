"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendOrderDocumentEmail } from "@/lib/actions/order-documents";
import { PRINT_DOC_MENU_LABELS, type PrintDocType } from "@/lib/print-docs";

const DOC_TYPES: PrintDocType[] = ["contract", "quote", "handover", "collection", "acceptance"];

export function SendDocumentEmailDialog({
  orderId,
  customerEmail,
}: {
  orderId: string;
  customerEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<PrintDocType>("contract");

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await sendOrderDocumentEmail(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setSuccess(false);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Mail className="size-4" />
            Gửi email
          </Button>
        }
      />
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="doc_type" value={docType} />
          <DialogHeader>
            <DialogTitle>Gửi chứng từ qua email</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="doc_type">Loại chứng từ</Label>
            <Select value={docType} onValueChange={(value) => setDocType(value as PrintDocType)}>
              <SelectTrigger id="doc_type" className="w-full">
                <SelectValue>{(value: PrintDocType) => PRINT_DOC_MENU_LABELS[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PRINT_DOC_MENU_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email khách hàng</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customerEmail ?? ""}
              placeholder="khach@example.com"
              required
            />
            {!customerEmail && (
              <p className="text-xs text-muted-foreground">
                Khách chưa có email lưu sẵn — điền tay ở đây rồi gửi.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Đã gửi email thành công.</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang xuất PDF & gửi..." : "Gửi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
