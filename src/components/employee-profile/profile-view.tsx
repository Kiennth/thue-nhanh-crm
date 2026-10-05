import Link from "next/link";
import type { ReactNode } from "react";
import {
  Award,
  BadgeCheck,
  Cake,
  CalendarHeart,
  ClipboardCheck,
  Globe as Facebook,
  HeartPulse,
  IdCard,
  Mail,
  MapPin,
  NotebookPen,
  Phone,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { BranchBadge, branchColorVar } from "@/components/branch-badge";
import { ROLE_LABELS } from "@/lib/roles";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { vnTodayString } from "@/lib/vn-time";
import type { ProfileData } from "@/lib/employee-profile-data";
import { AvatarUpload } from "./avatar-upload";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dmy = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts.length > 1 ? parts[parts.length - 2][0] : "") + parts[parts.length - 1][0]).toUpperCase();
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// Còn bao nhiêu ngày tới sinh nhật kế tiếp (0 = hôm nay).
function daysToBirthday(birthday: string, today: string): number {
  const y = Number(today.slice(0, 4));
  const md = birthday.slice(5, 10);
  let next = `${y}-${md}`;
  if (next < today) next = `${y + 1}-${md}`;
  return daysBetween(today, next);
}

function tenureText(createdAt: string, today: string): string {
  const days = daysBetween(createdAt.slice(0, 10), today);
  if (days < 31) return `${days} ngày`;
  const months = Math.floor(days / 30.44);
  return months < 12 ? `${months} tháng` : `${Math.floor(months / 12)} năm ${months % 12 ? `${months % 12} tháng` : ""}`.trim();
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{children || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Phone; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// Trang hồ sơ "xịn" dùng chung cho "Hồ sơ của tôi" và Giám đốc xem nhân viên
// (CEO 2026-10-05). mode="director" (Giám đốc/Admin/Kế toán) hiện thêm ghi chú nội bộ.
export function ProfileView({
  data,
  mode,
  actions,
  showMoney = true,
}: {
  data: ProfileData;
  mode: "self" | "director";
  actions?: ReactNode;
  // Ẩn thu nhập + bậc thưởng (Admin xem hồ sơ người khác).
  showMoney?: boolean;
}) {
  const { employee: e, profile: p, perf } = data;
  const today = vnTodayString();
  const color = data.branchName ? branchColorVar(data.branchName) : null;
  const c = `var(${color ?? "--primary"})`;
  const gradient = `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 55%, #7c3aed))`;
  const bday = e.birthday ? daysToBirthday(e.birthday, today) : null;
  // Ngày vào công ty do Giám đốc nhập; chưa nhập thì lấy ngày tạo tài khoản CRM.
  const joined = p?.joined_on ?? e.created_at.slice(0, 10);
  const tel = (v: string | null) => (v ? <a href={`tel:${v.replace(/\s/g, "")}`} className="hover:underline">{v}</a> : null);

  const allStats = [
    { icon: Wallet, label: `Thu nhập tạm tính T${perf.month.slice(5)}`, value: `${vnd.format(perf.totalIncome)}đ`, accent: true },
    { icon: ClipboardCheck, label: "Khâu đã làm tháng này", value: String(perf.completedTaskCount) },
    { icon: Award, label: "Thưởng tháng này", value: `${vnd.format(perf.rewardPay)}đ` },
    { icon: BadgeCheck, label: "Tổng khâu đã làm", value: vnd.format(data.lifetimeTasks) },
    { icon: Sparkles, label: "Số đơn đã tham gia", value: vnd.format(data.lifetimeOrders) },
  ];
  const stats = showMoney ? allStats : allStats.filter((s) => s.icon !== Wallet && s.icon !== Award);

  return (
    <div className="space-y-5">
      {/* Bìa + ảnh đại diện */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="relative h-36 sm:h-44" style={{ background: gradient }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(255,255,255,.2),transparent_40%)]" />
        </div>
        <div className="flex flex-wrap items-end gap-5 px-6 pb-5">
          <div className="-mt-14">
            <AvatarUpload
              employeeId={e.id}
              url={p?.avatar_url ?? null}
              initials={initialsOf(e.name)}
              gradient={gradient}
              editable
            />
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{e.name}</h1>
              {!e.is_active && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Đã nghỉ</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{ROLE_LABELS[e.role]}</span>
              {data.branchName && <BranchBadge name={data.branchName} />}
              <span>
                · Vào công ty {dmy(joined)} ({tenureText(joined, today)})
              </span>
            </div>
            {bday !== null && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-3 py-1 text-sm font-medium text-pink-700 dark:text-pink-300">
                <Cake className="size-4" />
                {bday === 0 ? "Hôm nay là sinh nhật! 🎉" : `Sinh nhật ${dmy(e.birthday!).slice(0, 5)} · còn ${bday} ngày`}
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-3">{actions}</div>
        </div>
        {p?.bio && (
          <p className="border-t px-6 py-4 text-[15px] leading-7 text-muted-foreground italic">“{p.bio}”</p>
        )}
      </div>

      {/* Số liệu */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border p-4 ${s.accent ? "text-white shadow-md" : "bg-card"}`}
            style={s.accent ? { background: gradient } : undefined}
          >
            <s.icon className={`size-5 ${s.accent ? "text-white/90" : "text-primary"}`} />
            <p className={`mt-2 text-xs ${s.accent ? "text-white/85" : "text-muted-foreground"}`}>{s.label}</p>
            <p className="text-xl font-extrabold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {showMoney && perf.nextTier && (
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Tiến tới bậc thưởng {perf.nextTier.tierNumber}</span>
            <span className="text-muted-foreground">
              thưởng {vnd.format(perf.nextTier.bonusAmount)}đ khi đạt {vnd.format(perf.nextTier.thresholdAmount)}đ
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.round(perf.progressToNextTier * 100))}%`, background: gradient }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Liên hệ" icon={Phone}>
          <InfoRow icon={Phone} label="SĐT công ty">{tel(p?.company_phone ?? null)}</InfoRow>
          <InfoRow icon={Smartphone} label="SĐT cá nhân">{tel(p?.personal_phone ?? null)}</InfoRow>
          <InfoRow icon={Mail} label="Email">{e.email}</InfoRow>
          <InfoRow icon={Facebook} label="Facebook">
            {p?.facebook_url ? (
              <a href={p.facebook_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {p.facebook_url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : null}
          </InfoRow>
          <InfoRow icon={MapPin} label="Địa chỉ">{p?.address}</InfoRow>
        </Section>

        <Section title="Cá nhân & khẩn cấp" icon={HeartPulse}>
          <InfoRow icon={HeartPulse} label="Người liên lạc">
            {p?.emergency_name ? `${p.emergency_name}${p.emergency_relation ? ` (${p.emergency_relation})` : ""}` : null}
          </InfoRow>
          <InfoRow icon={Phone} label="SĐT khẩn cấp">{tel(p?.emergency_phone ?? null)}</InfoRow>
          <InfoRow icon={CalendarHeart} label="Ngày sinh">{e.birthday ? dmy(e.birthday) : null}</InfoRow>
          <InfoRow icon={BadgeCheck} label="Ngày vào công ty">
            {p?.joined_on ? `${dmy(p.joined_on)} · ${tenureText(p.joined_on, today)}` : mode === "director" ? "Chưa nhập — sửa ở khối bên dưới" : null}
          </InfoRow>
        </Section>

        <Section title="Căn cước công dân" icon={IdCard}>
          <InfoRow icon={IdCard} label="Số CCCD">{p?.citizen_id}</InfoRow>
          <InfoRow icon={CalendarHeart} label="Ngày cấp">{p?.citizen_id_issued_on ? dmy(p.citizen_id_issued_on) : null}</InfoRow>
          <InfoRow icon={MapPin} label="Nơi cấp">{p?.citizen_id_issued_place}</InfoRow>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Việc làm gần đây" icon={ClipboardCheck}>
          {data.recentTasks.length ? (
            <ul className="divide-y">
              {data.recentTasks.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{TASK_TYPE_LABELS[t.taskType]}</span>
                    {" · "}
                    <Link href={`/orders/${t.orderId}`} className="text-primary hover:underline">
                      {t.orderCode}
                    </Link>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{dmy(t.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có khâu nào.</p>
          )}
        </Section>
        {showMoney && (
          <Section title="Thưởng gần đây" icon={Award}>
            {data.rewards.length ? (
              <ul className="divide-y">
                {data.rewards.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{r.reason}</span>
                    <span className="shrink-0 font-semibold text-emerald-600 tabular-nums">
                      +{vnd.format(r.amount)}đ <span className="font-normal text-muted-foreground">{dmy(r.date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có.</p>
            )}
          </Section>
        )}
      </div>

      {mode === "director" && p?.notes && (
        <Section title="Ghi chú nội bộ (chỉ quản lý thấy)" icon={NotebookPen}>
          <p className="text-sm whitespace-pre-wrap">{p.notes}</p>
        </Section>
      )}
    </div>
  );
}
