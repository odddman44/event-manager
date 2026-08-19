import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <AppHeader />
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
