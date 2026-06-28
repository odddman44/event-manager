import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AdminLogoutButton } from "@/components/admin-logout-button";

const navItems = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/events", label: "이벤트 관리" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/stats", label: "통계 분석" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-screen">
      <aside className="flex w-56 flex-col border-r p-4">
        <div className="text-brand mb-4 font-bold">Moija Admin</div>
        <div className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2 text-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <ThemeSwitcher />
          <AdminLogoutButton />
        </div>
      </aside>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
