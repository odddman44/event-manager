import Link from "next/link";
import { Users, CalendarDays, Activity, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// 더미 통계 데이터
const stats = [
  {
    label: "총 이벤트",
    value: "20개",
    change: "+12% 전달 대비",
    icon: CalendarDays,
  },
  { label: "총 사용자", value: "10명", change: "+8% 전달 대비", icon: Users },
  {
    label: "진행 중 이벤트",
    value: "5개",
    change: "-5% 전달 대비",
    icon: Activity,
  },
  {
    label: "이번 달 신규",
    value: "10개",
    change: "+15% 전달 대비",
    icon: TrendingUp,
  },
];

// 최근 이벤트 더미 데이터
const recentEvents = [
  {
    title: "스타트업 창업자 밋업",
    coverImage: "https://picsum.photos/seed/startup/400/200",
    date: "2025-10-19T17:54:00",
    organizer: {
      name: "정수아",
      avatar: "https://api.dicebear.com/7.x/personas/svg?seed=sua",
    },
    participants: 7,
  },
  {
    title: "코딩 테스트 스터디",
    coverImage: "https://picsum.photos/seed/coding/400/200",
    date: "2025-10-16T17:54:00",
    organizer: {
      name: "박준서",
      avatar: "https://api.dicebear.com/7.x/personas/svg?seed=junseo",
    },
    participants: 4,
  },
  {
    title: "주니어 개발자 취업 준비 모임",
    coverImage: "https://picsum.photos/seed/junior/400/200",
    date: "2025-10-24T17:54:00",
    organizer: {
      name: "박준서",
      avatar: "https://api.dicebear.com/7.x/personas/svg?seed=junseo",
    },
    participants: 6,
  },
];

// 최근 가입자 더미 데이터
const recentUsers = [
  {
    name: "오서준",
    email: "오서준@gather.com",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=seojun",
  },
  {
    name: "한예준",
    email: "한예준@gather.com",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=yejun",
  },
  {
    name: "임지민",
    email: "임지민@gather.com",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=jimin",
  },
];

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

      {/* 통계 카드 4개 */}
      <section>
        <h2 className="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
          현황 요약
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value, change }) => (
            <Card key={label} className="rounded-card">
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Icon className="text-primary h-5 w-5" />
                  </div>
                  <p className="text-muted-foreground text-sm">{label}</p>
                </div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-muted-foreground mt-1 text-xs">{change}</p>
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
          <ul className="divide-y">
            {recentEvents.map((event) => (
              <li key={event.title} className="flex gap-3 p-4">
                {/* 커버 이미지 썸네일 */}
                <img
                  src={event.coverImage}
                  alt={event.title}
                  className="h-14 w-20 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDate(event.date)}
                  </p>
                  {/* 주최자 + 참여자 수 */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <img
                      src={event.organizer.avatar}
                      alt={event.organizer.name}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                    <span className="text-muted-foreground text-xs">
                      {event.organizer.name}
                    </span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-muted-foreground text-xs">
                      {event.participants}명 참여
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 최근 가입자 */}
        <div className="rounded-card bg-card border shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">최근 가입자</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">전체 보기</Link>
            </Button>
          </div>
          <ul className="divide-y">
            {recentUsers.map((user) => (
              <li
                key={user.email}
                className="flex items-center gap-3 px-6 py-4"
              >
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </div>
              </li>
            ))}
          </ul>
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
