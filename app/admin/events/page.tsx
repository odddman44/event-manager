import { AdminDeleteButton } from "@/components/admin-delete-button";

// 더미 이벤트 데이터
const events = [
  {
    id: "1",
    title: "팀 워크숍",
    organizer: "김관리",
    date: "2026-07-05",
    participants: 12,
    created: "2026-06-20",
  },
  {
    id: "2",
    title: "개발자 밋업",
    organizer: "이주최",
    date: "2026-07-12",
    participants: 28,
    created: "2026-06-21",
  },
  {
    id: "3",
    title: "독서 모임",
    organizer: "박이벤",
    date: "2026-07-20",
    participants: 8,
    created: "2026-06-22",
  },
  {
    id: "4",
    title: "스터디 그룹",
    organizer: "최스터",
    date: "2026-07-25",
    participants: 5,
    created: "2026-06-23",
  },
];

export default function AdminEventsPage() {
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">이벤트 관리</h1>
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-sm">
          총 {events.length}개
        </span>
      </div>

      {/* 이벤트 테이블 */}
      <div className="rounded-card bg-card overflow-hidden border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="px-4 py-3 text-left font-semibold">제목</th>
              <th className="px-4 py-3 text-left font-semibold">주최자</th>
              <th className="px-4 py-3 text-left font-semibold">날짜</th>
              <th className="px-4 py-3 text-right font-semibold">참여자 수</th>
              <th className="px-4 py-3 text-left font-semibold">생성일</th>
              <th className="px-4 py-3 text-center font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="hover:bg-muted/20 border-b transition-colors last:border-0"
              >
                <td className="px-4 py-3 font-medium">{event.title}</td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.organizer}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.date}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {event.participants}명
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.created}
                </td>
                <td className="px-4 py-3 text-center">
                  <AdminDeleteButton label={event.title} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
