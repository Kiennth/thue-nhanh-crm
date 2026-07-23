"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { NAV_ITEMS, ROLE_LABELS, SETTINGS_LINK } from "@/lib/roles";
import { logout } from "@/lib/actions/auth";
import type { CurrentEmployee } from "@/lib/dal";

export function AppSidebar({ employee }: { employee: CurrentEmployee }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(employee.role));
  const showSettingsLink = SETTINGS_LINK.roles.includes(employee.role);

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link href="/" className="text-sm font-semibold">
          Thuê Nhanh CRM
        </Link>
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
        {showSettingsLink && (
          <Link
            href={SETTINGS_LINK.href}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {SETTINGS_LINK.label}
          </Link>
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
