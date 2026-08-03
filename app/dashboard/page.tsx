import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/event-card";
import { createClient } from "@/lib/supabase/server";
import {
  listEventsByOrganizer,
  listParticipatedEvents,
} from "@/src/services/event-service";

async function EventSections() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string;

  const [createdEvents, participatedEvents] = await Promise.all([
    listEventsByOrganizer(supabase, userId),
    listParticipatedEvents(supabase, userId),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-bold">내가 만든 이벤트</h2>
        {createdEvents.length === 0 ? (
          /* 빈 상태 UI */
          <div className="rounded-card flex flex-col items-center justify-center border border-dashed py-16 text-center">
            <p className="mb-2 text-lg font-medium">
              아직 만든 이벤트가 없어요.
            </p>
            <p className="text-muted-foreground mb-6 text-sm">
              첫 이벤트를 만들어보세요!
            </p>
            <Button
              asChild
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Link href="/events/new">이벤트 만들기</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {createdEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                href={`/events/${event.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">내가 참여한 이벤트</h2>
        {participatedEvents.length === 0 ? (
          <div className="rounded-card flex flex-col items-center justify-center border border-dashed py-12 text-center">
            <p className="mb-1 font-medium">참여한 이벤트가 없어요</p>
            <p className="text-muted-foreground text-sm">
              공유받은 링크로 이벤트에 참여해보세요!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {participatedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                href={`/join/${event.share_token}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 이벤트</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            참여하거나 호스팅하는 이벤트를 관리하세요
          </p>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90 text-white">
          <Link href="/events/new">새 이벤트 만들기</Link>
        </Button>
      </div>

      <Suspense>
        <EventSections />
      </Suspense>
    </div>
  );
}
