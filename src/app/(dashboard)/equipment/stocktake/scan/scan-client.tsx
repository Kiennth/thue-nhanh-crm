"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, CameraOff, CheckCircle2, Copy, Loader2, Play, RotateCcw, ScanLine, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/stocktake-csv";
import {
  addScannedMachine,
  listSerialTypes,
  loadScanScope,
  lookupScannedCodes,
  moveScannedToBranch,
  type ScanMachine,
} from "@/lib/actions/stocktake-scan";

type Extra = ScanMachine | null | "pending";
type Saved = { found: string[]; extra: string[] };

// Tiếng bíp phản hồi (không cần file âm thanh): đúng = 1 tiếng cao, lạ = 2 tiếng trầm.
function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.09);
    };
    if (ok) play(1320, 0);
    else {
      play(330, 0);
      play(330, 0.14);
    }
    navigator.vibrate?.(ok ? 40 : [60, 60, 60]);
  } catch {
    // trình duyệt chặn âm thanh — bỏ qua
  }
}

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export function ScanClient({
  branches,
  categories,
  lockedBranchId,
  canMove,
}: {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  lockedBranchId: string | null;
  canMove: boolean;
}) {
  const [branchId, setBranchId] = useState(lockedBranchId ?? branches[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [machines, setMachines] = useState<ScanMachine[] | null>(null);
  const [rentedCount, setRentedCount] = useState(0);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [code, setCode] = useState("");
  const [last, setLast] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, startLoad] = useTransition();
  const [moving, startMove] = useTransition();
  const [types, setTypes] = useState<Awaited<ReturnType<typeof listSerialTypes>> | null>(null);
  const [camOn, setCamOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recentCam = useRef<Map<string, number>>(new Map());

  const storageKey = `kk-scan:${branchId}:${categoryId}:${fold(search)}`;

  // Tra mã → máy trong danh sách "phải có" (serial + mã thẻ RFID).
  const index = useMemo(() => {
    const m = new Map<string, ScanMachine>();
    for (const x of machines ?? []) {
      m.set(fold(x.code), x);
      for (const t of x.rfid) m.set(fold(t), x);
    }
    return m;
  }, [machines]);

  // Lưu tiến độ trên máy (tải lại trang không mất).
  useEffect(() => {
    if (!machines) return;
    try {
      const saved: Saved = { found: [...found], extra: Object.keys(extra) };
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // bộ nhớ trình duyệt bị chặn — vẫn kiểm được, chỉ không lưu
    }
  }, [found, extra, machines, storageKey]);

  function start() {
    startLoad(async () => {
      const r = await loadScanScope(branchId, categoryId || null, search.trim() || null);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setMachines(r.machines);
      setRentedCount(r.rentedCount);
      let restored: Saved | null = null;
      try {
        restored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      } catch {
        restored = null;
      }
      const ids = new Set(r.machines.map((m) => m.id));
      setFound(new Set((restored?.found ?? []).filter((id) => ids.has(id))));
      const codes = restored?.extra ?? [];
      setExtra(Object.fromEntries(codes.map((c) => [c, "pending" as Extra])));
      if (codes.length) setExtra(await lookupScannedCodes(codes));
      if (restored?.found.length) toast.info(`Khôi phục lần quét dở: ${restored.found.length} máy.`);
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }

  async function scan(raw: string) {
    const c = raw.trim();
    if (!c || !machines) return;
    const hit = index.get(fold(c));
    if (hit) {
      if (found.has(hit.id)) {
        setLast({ text: `${hit.code} — đã quét rồi`, ok: true });
        return;
      }
      setFound((s) => new Set(s).add(hit.id));
      setLast({ text: `✓ ${hit.code} · ${hit.typeName}`, ok: true });
      beep(true);
      return;
    }
    const key = Object.keys(extra).find((k) => fold(k) === fold(c));
    if (key) {
      setLast({ text: `${c} — đã ghi nhận ở danh sách lạ`, ok: false });
      return;
    }
    beep(false);
    setExtra((e) => ({ ...e, [c]: "pending" }));
    setLast({ text: `? ${c} — không có trong danh sách kho này, đang tra…`, ok: false });
    const r = await lookupScannedCodes([c]);
    setExtra((e) => ({ ...e, [c]: r[c] ?? null }));
  }

  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  });

  function toggleCam() {
    if (camOn) {
      setCamOn(false);
      return;
    }
    if (!("BarcodeDetector" in window)) {
      toast.error("Trình duyệt này chưa quét được bằng camera — dùng Chrome trên Android, hoặc trên iPhone nhấn giữ ô nhập → Quét văn bản.");
      return;
    }
    setCamOn(true);
  }

  // Camera: dùng BarcodeDetector có sẵn (Chrome Android / Chrome máy tính).
  useEffect(() => {
    if (!camOn) return;
    const BD = (window as unknown as { BarcodeDetector?: new (o?: object) => Detector }).BarcodeDetector;
    if (!BD) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new BD();
        timer = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const now = Date.now();
            for (const { rawValue } of codes) {
              const k = fold(rawValue);
              if ((recentCam.current.get(k) ?? 0) > now - 2500) continue;
              recentCam.current.set(k, now);
              scanRef.current(rawValue);
            }
          } catch {
            // khung hình lỗi — bỏ qua
          }
        }, 350);
      } catch {
        toast.error("Không mở được camera (chưa cho phép quyền camera?).");
        setCamOn(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camOn]);

  const missing = (machines ?? []).filter((m) => !found.has(m.id));
  const extras = Object.entries(extra);
  const otherBranch = extras.filter(
    ([, v]) => v && v !== "pending" && v.status !== "rented" && v.status !== "disposed" && v.branchId !== branchId,
  ) as [string, ScanMachine][];
  const rentedSeen = extras.filter(([, v]) => v && v !== "pending" && v.status === "rented") as [string, ScanMachine][];
  const disposedSeen = extras.filter(([, v]) => v && v !== "pending" && v.status === "disposed") as [string, ScanMachine][];
  const unknown = extras.filter(([, v]) => v === null).map(([k]) => k);
  const pending = extras.filter(([, v]) => v === "pending").length;
  const total = machines?.length ?? 0;
  const pct = total ? Math.round((found.size / total) * 100) : 0;

  const missingByType = useMemo(() => {
    const m = new Map<string, ScanMachine[]>();
    for (const x of missing) m.set(x.typeName, [...(m.get(x.typeName) ?? []), x]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [missing]);

  function reset() {
    if (!confirm("Xoá toàn bộ kết quả quét của lần kiểm này?")) return;
    setFound(new Set());
    setExtra({});
    setLast(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  function copyMissing() {
    const text = missingByType.map(([t, list]) => `${t} (${list.length}): ${list.map((x) => x.code).join(", ")}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Đã copy danh sách máy thiếu."));
  }

  if (!machines) {
    return (
      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/70 dark:bg-blue-950/30">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sc_branch">Kho đang kiểm</Label>
            <select
              id="sc_branch"
              value={branchId}
              disabled={!!lockedBranchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc_cat">Nhóm hàng (tuỳ chọn)</Label>
            <select
              id="sc_cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Tất cả nhóm</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc_q">Tên hàng chứa (tuỳ chọn)</Label>
            <Input id="sc_q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="vd: ecoflow" className="h-10 w-48 bg-background" />
          </div>
          <Button onClick={start} disabled={loading || !branchId} className="h-10 px-5">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Bắt đầu kiểm
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Quét bằng máy quét mã vạch / đầu đọc RFID (cắm USB hoặc Bluetooth, gõ như bàn phím), camera Chrome trên Android, hoặc
          trên iPhone nhấn giữ ô nhập → “Quét văn bản”. Kết quả lưu ngay trên máy này, tải lại trang không mất.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Thanh tiến độ + ô quét — dính đầu trang khi cuộn danh sách dài. */}
      <section className="sticky top-14 z-10 space-y-3 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">
            {branches.find((b) => b.id === branchId)?.name} · Đã thấy {found.size}/{total} máy ({pct}%)
            {rentedCount > 0 && <span className="font-normal text-muted-foreground"> · {rentedCount} máy đang cho thuê không tính</span>}
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant={camOn ? "default" : "outline"} onClick={toggleCam}>
              {camOn ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {camOn ? "Tắt camera" : "Quét bằng camera"}
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="size-4" /> Làm lại
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMachines(null)}>
              Đổi kho
            </Button>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {camOn && (
          <video ref={videoRef} muted playsInline className="mx-auto max-h-64 w-full max-w-md rounded-lg bg-black object-cover" />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            scan(code);
            setCode("");
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Quét hoặc gõ serial / mã RFID rồi Enter"
              className="h-12 pl-10 text-lg"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          <Button type="submit" className="h-12 px-5">
            Ghi
          </Button>
        </form>
        {last && (
          <p className={cn("text-sm font-medium", last.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
            {last.text}
          </p>
        )}
      </section>

      {(otherBranch.length > 0 || rentedSeen.length > 0 || disposedSeen.length > 0 || unknown.length > 0 || pending > 0) && (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <TriangleAlert className="size-4" /> Máy lạ quét được ({extras.length}){pending > 0 && ` · đang tra ${pending}`}
          </h2>
          {otherBranch.length > 0 && (
            <div>
              <p className="text-sm font-medium">CRM ghi ở kho khác ({otherBranch.length})</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {otherBranch.map(([k, v]) => (
                  <li key={k}>
                    <b>{v.code}</b> · {v.typeName} · CRM ghi: {v.branchName ?? "chưa có kho"}
                  </li>
                ))}
              </ul>
              {canMove && (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={moving}
                  onClick={() =>
                    startMove(async () => {
                      const r = await moveScannedToBranch(otherBranch.map(([, v]) => v.id), branchId);
                      if ("error" in r) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(`Đã ghi ${r.moved} máy về kho này.`);
                      setExtra(await lookupScannedCodes(Object.keys(extra)));
                    })
                  }
                >
                  {moving && <Loader2 className="size-4 animate-spin" />}
                  Ghi {otherBranch.length} máy về {branches.find((b) => b.id === branchId)?.name}
                </Button>
              )}
            </div>
          )}
          {rentedSeen.length > 0 && (
            <div>
              <p className="text-sm font-medium">CRM ghi đang cho thuê nhưng lại có ở kho ({rentedSeen.length}) — kiểm tra đơn đã thu hồi chưa</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {rentedSeen.map(([k, v]) => (
                  <li key={k}>
                    <b>{v.code}</b> · {v.typeName}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {disposedSeen.length > 0 && (
            <div>
              <p className="text-sm font-medium">CRM ghi đã thanh lý ({disposedSeen.length})</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {disposedSeen.map(([k, v]) => (
                  <li key={k}>
                    <b>{v.code}</b> · {v.typeName}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unknown.length > 0 && (
            <div>
              <p className="text-sm font-medium">Chưa có trong CRM ({unknown.length}) — chọn mã hàng để thêm</p>
              <div className="mt-1 space-y-2">
                {unknown.map((c) => (
                  <UnknownRow
                    key={c}
                    code={c}
                    branchId={branchId}
                    types={types}
                    loadTypes={async () => setTypes(await listSerialTypes())}
                    onAdded={(m) => {
                      setExtra((e) => {
                        const n = { ...e };
                        delete n[c];
                        return n;
                      });
                      if (m.branchId === branchId) {
                        setMachines((list) => [...(list ?? []), m]);
                        setFound((s) => new Set(s).add(m.id));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Chưa thấy ({missing.length}){missing.length === 0 && total > 0 && " — đủ máy 🎉"}
          </h2>
          {missing.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyMissing}>
              <Copy className="size-4" /> Copy danh sách thiếu
            </Button>
          )}
        </div>
        <div className="max-h-[28rem] space-y-2 overflow-y-auto text-sm">
          {missingByType.map(([t, list]) => (
            <div key={t}>
              <p className="font-medium">
                {t} <span className="text-muted-foreground">({list.length})</span>
              </p>
              <p className="text-muted-foreground">{list.map((x) => x.code + (x.unitName ? ` (${x.unitName})` : "")).join(" · ")}</p>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Quét xong mà máy vẫn thiếu: kiểm tra đơn đang thuê, hoặc dùng “Kiểm kho bằng bảng tính” ghi “xoá” cho máy không còn.
          </p>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Đã thấy ({found.size})
        </h2>
        <p className="max-h-40 overflow-y-auto text-sm text-muted-foreground">
          {(machines ?? [])
            .filter((m) => found.has(m.id))
            .map((m) => m.code)
            .join(" · ") || "Chưa quét máy nào."}
        </p>
      </section>
    </div>
  );
}

function UnknownRow({
  code,
  branchId,
  types,
  loadTypes,
  onAdded,
}: {
  code: string;
  branchId: string;
  types: Awaited<ReturnType<typeof listSerialTypes>> | null;
  loadTypes: () => Promise<void>;
  onAdded: (m: ScanMachine) => void;
}) {
  const [typeName, setTypeName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [pending, start] = useTransition();
  const type = types?.find((t) => t.name === typeName);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 text-sm">
      <b className="min-w-24">{code}</b>
      <Input
        list="kk-types"
        value={typeName}
        onFocus={() => !types && loadTypes()}
        onChange={(e) => {
          setTypeName(e.target.value);
          setUnitId("");
        }}
        placeholder={types ? "Gõ tên mã hàng…" : "Đang tải mã hàng…"}
        className="h-8 min-w-56 flex-1"
      />
      <datalist id="kk-types">
        {types?.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      {type && type.units.length > 0 && (
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="h-8 rounded-md border bg-background px-2">
          <option value="">— biến thể —</option>
          {type.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        disabled={!type || (type.units.length > 1 && !unitId) || pending}
        onClick={() =>
          start(async () => {
            const r = await addScannedMachine({ code, typeId: type!.id, unitId: unitId || (type!.units.length === 1 ? type!.units[0].id : null), branchId });
            if ("error" in r) {
              toast.error(r.error);
              return;
            }
            toast.success(`Đã thêm ${code} vào ${type!.name}.`);
            onAdded(r.machine);
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Thêm vào CRM
      </Button>
    </div>
  );
}
