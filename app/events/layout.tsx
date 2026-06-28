import { Suspense } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { BottomNav } from "@/components/bottom-nav";

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-brand font-bold">
            모이자
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground hidden md:block"
            >
              내 이벤트
            </Link>
            <Link
              href="/events/new"
              className="text-muted-foreground hover:text-foreground hidden md:block"
            >
              새 이벤트
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      {/* 모바일에서 하단 네비게이션 높이만큼 패딩 추가 */}
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
