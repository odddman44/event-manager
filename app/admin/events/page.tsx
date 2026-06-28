import { AdminDeleteButton } from "@/components/admin-delete-button";

// 더미 이벤트 데이터 (커버 이미지 썸네일 포함)
const events = [
  {
    id: "1",
    title: "2025 개발자 네트워킹 밤",
    coverImage: "https://picsum.photos/seed/developer/80/60",
    organizer: "김민준",
    date: "2025-10-21",
    participants: "8/30",
    createdAt: "2025-10-01",
  },
  {
    id: "2",
    title: "UX/UI 디자인 워크샵",
    coverImage: "https://picsum.photos/seed/design/80/60",
    organizer: "강하윤",
    date: "2025-10-26",
    participants: "14/15",
    createdAt: "2025-10-05",
  },
  {
    id: "3",
    title: "테크 블로그 작성 챌린지",
    coverImage: "https://picsum.photos/seed/blog/80/60",
    organizer: "윤도현",
    date: "2025-09-29",
    participants: "20/20",
    createdAt: "2025-09-20",
  },
  {
    id: "4",
    title: "웹 접근성 세미나",
    coverImage: "https://picsum.photos/seed/seminar/80/60",
    organizer: "임지민",
    date: "2025-10-07",
    participants: "3/10",
    createdAt: "2025-09-25",
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
                {/* 썸네일 + 제목 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={event.coverImage}
                      alt={event.title}
                      className="h-8 w-10 shrink-0 rounded object-cover"
                    />
                    <span className="font-medium">{event.title}</span>
                  </div>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.organizer}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.date}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {event.participants}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {event.createdAt}
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
