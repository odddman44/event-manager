import Link from "next/link";
import { Users, CalendarDays, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminLogoutButton } from "@/components/admin-logout-button";

// 더미 통계 데이터
const stats = [
  { icon: Users, label: "총 가입자", value: 42, unit: "명" },
  { icon: CalendarDays, label: "총 이벤트", value: 18, unit: "개" },
  { icon: UserCheck, label: "총 참여자", value: 156, unit: "명" },
];

export default function AdminPage() {
  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">어드민 대시보드</h1>
        <AdminLogoutButton />
      </div>

      {/* 통계 카드 3개 */}
      <section>
        <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
          현황 요약
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {stats.map(({ icon: Icon, label, value, unit }) => (
            <Card key={label} className="rounded-card">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="bg-brand/10 flex h-12 w-12 items-center justify-center rounded-full">
                  <Icon className="text-brand h-6 w-6" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {value}
                    <span className="text-muted-foreground ml-1 text-base font-normal">
                      {unit}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-sm">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 빠른 링크 */}
      <section>
        <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
          빠른 링크
        </h2>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/admin/events">이벤트 관리</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/users">사용자 관리</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
