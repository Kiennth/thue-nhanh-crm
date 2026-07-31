"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
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

export function AppSidebar({ employee }: { employee: CurrentEmployee }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(employee.role));
  const settingsItems = SETTINGS_ITEMS.filter((item) => item.roles.includes(employee.role));

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link href="/" className="text-sm font-semibold">
          Thuê Nhanh CRM
        </Link>
        {/* Đèn LED trạng thái kiểu vỏ máy — chi tiết ký danh của Industrial
            Skeuomorphism, kèm nhãn mono như tem in trên chassis. */}
        <div className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 animate-pulse rounded-full bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.7)]"
          />
          <span className="font-mono text-[0.6rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            System Operational
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Quản lý</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/" />} isActive={pathname === "/"}>
                  Trang chủ
                </SidebarMenuButton>
              </SidebarMenuItem>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
