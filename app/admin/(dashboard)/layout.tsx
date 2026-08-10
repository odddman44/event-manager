import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AdminLogoutButton } from "@/components/admin-logout-button";

const navItems = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/events", label: "이벤트 관리" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/stats", label: "통계 분석" },
];

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-screen">
      <aside className="flex w-56 flex-col border-r p-4">
        <Link href="/admin" className="text-primary mb-4 block font-bold">
          Moija Admin
        </Link>
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
        <div className="mt-4 space-y-3 border-t pt-4">
          {/* 어드민 계정도 일반 사용자 화면을 쓸 수 있지만 진입 경로가 없었다.
              랜딩(/)으로 보내면 proxy가 어드민을 다시 /admin으로 되돌리므로 /dashboard로 직접 보낸다. */}
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:bg-muted hover:text-foreground block rounded-md px-3 py-2 text-sm"
          >
            사용자 화면으로
          </Link>
          <div className="flex items-center justify-between">
            <ThemeSwitcher />
            <AdminLogoutButton />
          </div>
        </div>
      </aside>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
