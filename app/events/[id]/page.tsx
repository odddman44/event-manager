import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CopyLinkButton from "@/components/copy-link-button";

// 더미 이벤트 데이터 (Phase 2: 하드코딩)
const DUMMY_EVENT = {
  title: "팀 워크숍",
  date: "2026-07-05T14:00",
  location: "서울 강남구 COEX",
  max: 20,
  registered: 12,
};

// 더미 참여자 데이터 (Phase 2: 하드코딩)
const DUMMY_PARTICIPANTS = [
  {
    name: "김철수",
    memo: "30분 전 도착",
    status: "registered",
    createdAt: "2026-06-28 10:30",
  },
  {
    name: "이영희",
    memo: "",
    status: "registered",
    createdAt: "2026-06-28 11:15",
  },
  {
    name: "박민수",
    memo: "참여 확정",
    status: "registered",
    createdAt: "2026-06-28 12:00",
  },
  {
    name: "최지현",
    memo: "",
    status: "cancelled",
    createdAt: "2026-06-28 13:20",
  },
  {
    name: "정태양",
    memo: "늦게 도착",
    status: "registered",
    createdAt: "2026-06-28 14:05",
  },
];

// 날짜 포맷: 2026년 7월 5일 오후 2:00
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
  const shareLink = "https://example.com/join/demo-token-123";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* a) 이벤트 정보 카드 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">{event.title}</h1>

        <div className="text-muted-foreground mb-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-brand h-4 w-4 shrink-0" />
            <span>{formatDate(event.date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-brand h-4 w-4 shrink-0" />
            <span>{event.location ?? "장소 미정"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="text-brand h-4 w-4 shrink-0" />
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
              className="bg-brand h-full rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
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

      {/* c) 참여자 목록 테이블 */}
      <div className="rounded-card bg-card border shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">참여자 목록</h2>
          <p className="text-muted-foreground text-sm">
            총 {participants.filter((p) => p.status === "registered").length}명
            참여
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">
                  이름
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">
                  메모
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">
                  상태
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">
                  신청 시각
                </th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant, index) => (
                <tr
                  key={index}
                  className="hover:bg-muted/30 border-b last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{participant.name}</td>
                  <td className="text-muted-foreground px-4 py-3">
                    {participant.memo || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {participant.status === "registered" ? (
                      <Badge className="border-green-200 bg-green-100 text-green-700 hover:bg-green-100">
                        참여
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-100"
                      >
                        취소
                      </Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {participant.createdAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
