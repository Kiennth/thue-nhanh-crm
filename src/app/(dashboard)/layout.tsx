import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getCurrentEmployee } from "@/lib/dal";
import { HeaderClock } from "./header-clock";

// Vị trí theo IP người dùng — Cloudflare edge đã tự phân giải geo-IP cho mọi
// request (cf.city/cf.country), không cần gọi API bên thứ ba hay lộ IP ra
// ngoài. cf undefined khi chạy `next dev` cục bộ (không qua edge Cloudflare).
async function getRequestLocation(): Promise<string | null> {
  try {
    const { cf } = await getCloudflareContext({ async: true });
    if (!cf) return null;
    const city = typeof cf.city === "string" ? cf.city : null;
    const country = typeof cf.country === "string" ? cf.country : null;
    return [city, country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [employee, location] = await Promise.all([getCurrentEmployee(), getRequestLocation()]);

  if (!employee) {
    redirect("/login?error=no-employee");
  }

  return (
    <SidebarProvider>
      <AppSidebar employee={employee} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">
            Xin chào, {employee.name}
          </span>
          <HeaderClock location={location} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
