"use client";

import { useEffect, useState } from "react";

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (days > 0 || hours > 0) parts.push(`${hours} giờ`);
  parts.push(`${minutes} phút`);
  return parts.join(" ");
}

export function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      setRemainingMs(new Date(targetDate).getTime() - Date.now());
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (remainingMs === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const overdue = remainingMs < 0;

  return (
    <span className={`font-mono text-sm ${overdue ? "font-medium text-destructive" : "text-foreground"}`}>
      {overdue ? "Quá hạn " : "Còn "}
      {formatDuration(remainingMs)}
    </span>
  );
}
