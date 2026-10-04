"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  Camera,
  ClipboardList,
  Contact,
  FileText,
  Gift,
  GraduationCap,
  Globe,
  HandCoins,
  House,
  KeyRound,
  LogOut,
  Receipt,
  Settings,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS, ROLE_LABELS, SETTINGS_ITEMS } from "@/lib/roles";
import { logout } from "@/lib/actions/auth";
import type { CurrentEmployee } from "@/lib/dal";

// Menu trái có icon + màu riêng từng mục, chữ to/đậm hơn (CEO 2026-10-04:
// "tô đậm, màu sắc hơn, trực quan hơn"). Class viết sẵn đủ chữ để Tailwind
// quét được — không ghép chuỗi màu.
const NAV_STYLE: Record<string, { icon: LucideIcon; tile: string; active: string }> = {
  "/": {
    icon: House,
    tile: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
    active: "data-active:bg-slate-500/12 data-active:text-slate-800 dark:data-active:text-slate-100",
  },
  "/orders": {
    icon: ClipboardList,
    tile: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    active: "data-active:bg-blue-500/12 data-active:text-blue-700 dark:data-active:text-blue-300",
  },
  "/calendar": {
    icon: CalendarDays,
    tile: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
    active: "data-active:bg-indigo-500/12 data-active:text-indigo-700 dark:data-active:text-indigo-300",
  },
  "/customers": {
    icon: Users,
    tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    active: "data-active:bg-violet-500/12 data-active:text-violet-700 dark:data-active:text-violet-300",
  },
  "/orderers": {
    icon: Contact,
    tile: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
    active: "data-active:bg-fuchsia-500/12 data-active:text-fuchsia-700 dark:data-active:text-fuchsia-300",
  },
  "/equipment": {
    icon: Camera,
    tile: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
    active: "data-active:bg-orange-500/12 data-active:text-orange-700 dark:data-active:text-orange-300",
  },
  "/payroll": {
    icon: WalletCards,
    tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    active: "data-active:bg-emerald-500/12 data-active:text-emerald-700 dark:data-active:text-emerald-300",
  },
  "/debts": {
    icon: HandCoins,
    tile: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
    active: "data-active:bg-rose-500/12 data-active:text-rose-700 dark:data-active:text-rose-300",
  },
  "/invoices": {
    icon: FileText,
    tile: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
    active: "data-active:bg-cyan-500/12 data-active:text-cyan-700 dark:data-active:text-cyan-300",
  },
  "/rewards": {
    icon: Gift,
    tile: "bg-pink-500/12 text-pink-600 dark:text-pink-400",
    active: "data-active:bg-pink-500/12 data-active:text-pink-700 dark:data-active:text-pink-300",
  },
  "/expenses": {
    icon: Receipt,
    tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    active: "data-active:bg-amber-500/15 data-active:text-amber-700 dark:data-active:text-amber-300",
  },
  "/training": {
    icon: GraduationCap,
    tile: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    active: "data-active:bg-teal-500/12 data-active:text-teal-700 dark:data-active:text-teal-300",
  },
  "/website": {
    icon: Globe,
    tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    active: "data-active:bg-sky-500/12 data-active:text-sky-700 dark:data-active:text-sky-300",
  },
};
const FALLBACK_STYLE = {
  icon: BadgeDollarSign,
  tile: "bg-gray-500/12 text-gray-600 dark:text-gray-300",
  active: "data-active:bg-gray-500/12",
};

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  const style = NAV_STYLE[href] ?? FALLBACK_STYLE;
  const Icon = style.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={href} />}
        isActive={active}
        className={`h-10 gap-3 px-2 text-[15px] font-semibold text-sidebar-foreground/85 data-active:font-bold ${style.active}`}
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-[18px]! ${style.tile}`}
        >
          <Icon strokeWidth={2.25} />
        </span>
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ employee }: { employee: CurrentEmployee }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(employee.role));
  const settingsItems = SETTINGS_ITEMS.filter((item) => item.roles.includes(employee.role));

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link href="/" className="text-base font-bold">
          Thuê Nhanh CRM
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 animate-pulse rounded-full bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.7)]"
          />
          <span className="text-[0.6rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            System Operational
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold tracking-[0.08em] uppercase">
            Quản lý
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <NavLink href="/" label="Trang chủ" active={pathname === "/"} />
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={pathname.startsWith(item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">{employee.name}</p>
          <p className="text-muted-foreground">{ROLE_LABELS[employee.role]}</p>
        </div>
        {settingsItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Settings className="size-3" />
                  Cài đặt
                </button>
              }
            />
            <DropdownMenuContent align="start" side="top">
              {settingsItems.map((item) => (
                <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Đổi mật khẩu (CEO 2026-10-03) — dùng lại trang đặt mật khẩu của
            luồng mời nhân viên, đang đăng nhập là đổi được ngay. */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          render={<Link href="/set-password" />}
        >
          <KeyRound className="size-4" />
          Đổi mật khẩu
        </Button>
        <form action={logout}>
          <Button variant="outline" size="sm" className="w-full justify-start" type="submit">
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
