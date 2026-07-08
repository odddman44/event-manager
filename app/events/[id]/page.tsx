import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CopyLinkButton from "@/components/copy-link-button";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/src/services/event-service";

// 날짜 포맷: 2025년 10월 21일 오후 3:36 (서버 실행 위치와 무관하게 KST 고정)
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function EventDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub as string;

  const detail = await getEventDetail(supabase, id, organizerId);
  if (!detail) {
    redirect("/dashboard");
  }
  const { event, participants } = detail;

  const registeredParticipants = participants.filter(
    (p) => p.status === "registered",
  );
  const progressPercent =
    event.max_participants !== null
      ? Math.round(
          (registeredParticipants.length / event.max_participants) * 100,
        )
      : null;

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const shareLink = `${protocol}://${host}/join/${event.share_token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* a) 이벤트 정보 카드 */}
      <div className="rounded-card bg-card overflow-hidden border p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">{event.title}</h1>

        <div className="text-muted-foreground mb-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary h-4 w-4 shrink-0" />
            <span>{formatDate(event.event_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-primary h-4 w-4 shrink-0" />
            <span>{event.location ?? "장소 미정"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="text-primary h-4 w-4 shrink-0" />
            <span>
              정원{" "}
              {event.max_participants !== null
                ? `${event.max_participants}명`
                : "제한 없음"}
            </span>
          </div>
        </div>

        {/* 참여 인원 카운터 + 진행률 바 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {registeredParticipants.length}
              {event.max_participants !== null
                ? ` / ${event.max_participants}명 참여 중`
                : "명 참여 중"}
            </span>
            {progressPercent !== null && (
              <span className="text-muted-foreground">{progressPercent}%</span>
            )}
          </div>
          {progressPercent !== null && (
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* b) 공유 링크 복사 영역 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          참여 링크
        </p>
        <div className="flex items-center gap-3">
          <div className="bg-muted text-muted-foreground flex-1 overflow-hidden rounded-md border px-3 py-2 text-sm">
            <span className="block truncate">{shareLink}</span>
          </div>
          <CopyLinkButton link={shareLink} />
        </div>
      </div>

      {/* c) 참여자 목록 */}
      <div className="rounded-card bg-card border shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">참여자 목록</h2>
          <p className="text-muted-foreground text-sm">
            총 {registeredParticipants.length}명 참여
          </p>
        </div>

        {participants.length === 0 ? (
          <p className="text-muted-foreground px-6 py-8 text-center text-sm">
            아직 참여자가 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center justify-between gap-3 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {participant.name}
                  </p>
                  {participant.memo && (
                    <p className="text-muted-foreground truncate text-xs">
                      {participant.memo}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {formatDate(participant.created_at)} 신청
                  </p>
                </div>

                {participant.status === "registered" ? (
                  <Badge className="shrink-0 border-green-200 bg-green-100 text-xs text-green-700 hover:bg-green-100">
                    참여
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="shrink-0 border-gray-200 bg-gray-100 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    취소
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense>
      <EventDetailContent params={params} />
    </Suspense>
  );
}
