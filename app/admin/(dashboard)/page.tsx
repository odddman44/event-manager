import { Suspense } from "react";
import Link from "next/link";
import { Users, CalendarDays, Activity, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/src/services/admin-service";

// 날짜 포맷 헬퍼
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteStr = minute === 0 ? "00" : String(minute).padStart(2, "0");
  return `${month}월 ${day}일 ${ampm} ${hour12}:${minuteStr}`;
}

async function AdminDashboardContent() {
  const supabase = await createClient();
  const { stats, recentEvents, recentUsers } = await getDashboardData(supabase);

  const statCards = [
    { label: "총 이벤트", value: `${stats.totalEvents}개`, icon: CalendarDays },
    { label: "총 사용자", value: `${stats.totalUsers}명`, icon: Users },
    {
      label: "총 참여자 수",
      value: `${stats.totalParticipants}명`,
      icon: UserCheck,
    },
    {
      label: "진행 예정 이벤트",
      value: `${stats.upcomingEvents}개`,
      icon: Activity,
    },
  ];

  return (
    <>
      {/* 통계 카드 4개 */}
      <section>
        <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
          현황 요약
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map(({ icon: Icon, label, value }) => (
            <Card key={label} className="rounded-card">
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Icon className="text-primary h-5 w-5" />
                  </div>
                  <p className="text-muted-foreground text-sm">{label}</p>
                </div>
                <p className="text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 최근 이벤트 + 최근 가입자 2열 그리드 */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 최근 이벤트 */}
        <div className="rounded-card bg-card border shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">최근 이벤트</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/events">전체 보기</Link>
            </Button>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 등록된 이벤트가 없습니다.
            </p>
          ) : (
            <ul className="divide-y">
              {recentEvents.map((event) => (
                <li key={event.id} className="p-4">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDate(event.event_date)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {event.organizer_name}
                    </span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-muted-foreground text-xs">
                      {event.participant_count}명 참여
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 가입자 */}
        <div className="rounded-card bg-card border shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">최근 가입자</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">전체 보기</Link>
            </Button>
          </div>
          {recentUsers.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 가입한 사용자가 없습니다.
            </p>
          ) : (
            <ul className="divide-y">
              {recentUsers.map((user) => (
                <li key={user.id} className="px-6 py-4">
                  <p className="text-sm font-medium">
                    {user.full_name ?? "이름 없음"}
                  </p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          관리자 주요 지표와 최근 활동을 확인하세요
        </p>
      </div>

      <Suspense>
        <AdminDashboardContent />
      </Suspense>

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
