"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <div className="mb-6 flex justify-end print:hidden">
      <Button onClick={() => window.print()}>
        <Printer className="size-4" />
        In / Lưu PDF
      </Button>
    </div>
  );
}
