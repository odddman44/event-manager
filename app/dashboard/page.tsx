import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { listEventsByOrganizer } from "@/src/services/event-service";

// 날짜 포맷: 2025년 10월 21일 오후 3:36
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteStr = minute === 0 ? "00" : String(minute).padStart(2, "0");
  return `${year}년 ${month}월 ${day}일 ${ampm} ${hour12}:${minuteStr}`;
}

// 참여 현황에 따라 뱃지 색상 결정 (정원 없으면 항상 모집 중)
function getStatusBadge(registered: number, max: number | null) {
  if (max === null) {
    return {
      label: "모집 중",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  const ratio = registered / max;
  if (registered >= max) {
    return {
      label: "마감",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (ratio >= 0.8) {
    return {
      label: "거의 마감",
      className: "bg-orange-100 text-orange-700 border-orange-200",
    };
  }
  return {
    label: "모집 중",
    className: "bg-green-100 text-green-700 border-green-200",
  };
}

async function EventList() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub as string;

  const events = await listEventsByOrganizer(supabase, organizerId);

  if (events.length === 0) {
    return (
      /* 빈 상태 UI */
      <div className="rounded-card flex flex-col items-center justify-center border border-dashed py-16 text-center">
        <p className="mb-2 text-lg font-medium">아직 만든 이벤트가 없어요.</p>
        <p className="text-muted-foreground mb-6 text-sm">
          첫 이벤트를 만들어보세요!
        </p>
        <Button asChild className="bg-primary hover:bg-primary/90 text-white">
          <Link href="/events/new">이벤트 만들기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => {
        const status = getStatusBadge(
          event.participant_count,
          event.max_participants,
        );
        return (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="rounded-card bg-card block overflow-hidden border p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">{event.title}</h2>
              <span
                className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            </div>

            <div className="text-muted-foreground space-y-1 text-sm">
              <p>📅 {formatDate(event.event_date)}</p>
              <p>📍 {event.location ?? "장소 미정"}</p>
              <p>
                👥 {event.participant_count}
                {event.max_participants !== null
                  ? ` / ${event.max_participants}명`
                  : "명 (정원 제한 없음)"}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 이벤트</h1>
        <Button asChild className="bg-primary hover:bg-primary/90 text-white">
          <Link href="/events/new">새 이벤트 만들기</Link>
        </Button>
      </div>

      <Suspense>
        <EventList />
      </Suspense>
    </div>
  );
}
