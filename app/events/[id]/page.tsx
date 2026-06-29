import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CopyLinkButton from "@/components/copy-link-button";

// 더미 이벤트 데이터 (커버 이미지 + 주최자 아바타 포함)
const DUMMY_EVENT = {
  id: "1",
  title: "2025 개발자 네트워킹 밤",
  coverImage: "https://picsum.photos/seed/developer/400/200",
  description:
    "서울의 개발자들이 모여 네트워킹하고 경험을 공유하는 자리입니다.",
  event_date: "2025-10-21T15:36:00",
  location: "강남구 테헤란로 152, 강남파이낸스센터",
  max: 30,
  registered: 8,
  share_token: "DEV2025",
  organizer: {
    name: "김민준",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=minjun",
  },
};

// 더미 참여자 데이터 (아바타 + 역할 포함)
const DUMMY_PARTICIPANTS = [
  {
    id: "1",
    name: "김민준",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=minjun",
    status: "registered",
    role: "host",
  },
  {
    id: "2",
    name: "강하윤",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=hayun",
    status: "registered",
    role: "participant",
  },
  {
    id: "3",
    name: "윤도현",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=dohyun",
    status: "registered",
    role: "participant",
  },
  {
    id: "4",
    name: "임지민",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=jimin",
    status: "registered",
    role: "participant",
  },
  {
    id: "5",
    name: "한예준",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=yejun",
    status: "cancelled",
    role: "participant",
  },
];

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

export default function EventDetailPage() {
  const event = DUMMY_EVENT;
  const participants = DUMMY_PARTICIPANTS;
  const progressPercent = Math.round((event.registered / event.max) * 100);
  const shareLink = `https://moija.app/join/${event.share_token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* a) 이벤트 정보 카드 */}
      <div className="rounded-card bg-card overflow-hidden border shadow-sm">
        {/* 커버 이미지 */}
        <img
          src={event.coverImage}
          alt={event.title}
          className="h-48 w-full object-cover"
        />

        <div className="p-6">
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
              <span>정원 {event.max}명</span>
            </div>
          </div>

          {/* 참여 인원 카운터 + 진행률 바 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {event.registered} / {event.max}명 참여 중
              </span>
              <span className="text-muted-foreground">{progressPercent}%</span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
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
          {/* 링크 복사 버튼 — 클라이언트 컴포넌트로 분리 */}
          <CopyLinkButton link={shareLink} />
        </div>
      </div>

      {/* c) 참여자 목록 — 리스트 형태 */}
      <div className="rounded-card bg-card border shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">참여자 목록</h2>
          <p className="text-muted-foreground text-sm">
            총 {participants.filter((p) => p.status === "registered").length}명
            참여
          </p>
        </div>

        <ul className="divide-y">
          {participants.map((participant) => (
            <li
              key={participant.id}
              className="flex items-center gap-3 px-6 py-3"
            >
              {/* 아바타 이미지 */}
              <img
                src={participant.avatar}
                alt={participant.name}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />

              {/* 이름 */}
              <span className="flex-1 text-sm font-medium">
                {participant.name}
              </span>

              {/* 역할 배지 */}
              {participant.role === "host" ? (
                <Badge className="bg-primary hover:bg-primary/80 border-transparent text-xs text-white">
                  호스트
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  참여자
                </Badge>
              )}

              {/* 상태 배지 */}
              {participant.status === "registered" ? (
                <Badge className="border-green-200 bg-green-100 text-xs text-green-700 hover:bg-green-100">
                  참여
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="border-gray-200 bg-gray-100 text-xs text-gray-500 hover:bg-gray-100"
                >
                  취소
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
