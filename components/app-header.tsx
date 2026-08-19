import { Suspense } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AdminNavLink } from "@/components/admin-nav-link";

// dashboard/layout.tsx의 헤더를 그대로 추출한 것 — 로그인 사용자가 보는 앱 헤더는
// 어디서 보든 동일해야 하므로(대시보드/참여 페이지 등) 이 컴포넌트 하나만 재사용한다.
export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-primary font-bold">
          모이자
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/events/new"
            className="text-muted-foreground hover:text-foreground hidden md:block"
          >
            새 이벤트
          </Link>
          <Suspense fallback={null}>
            <AdminNavLink />
          </Suspense>
          <ThemeSwitcher />
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
