import { Suspense } from "react";
import { AdminDeleteButton } from "@/components/admin-delete-button";
import { createClient } from "@/lib/supabase/server";
import { listAllEvents } from "@/src/services/admin-service";
import { deleteEventAction } from "@/src/controllers/admin-controller";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

async function AdminEventsContent() {
  const supabase = await createClient();
  const events = await listAllEvents(supabase);

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
      {events.length === 0 ? (
        <div className="rounded-card border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 이벤트가 없습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-card bg-card overflow-hidden border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="px-4 py-3 text-left font-semibold">제목</th>
                <th className="px-4 py-3 text-left font-semibold">주최자</th>
                <th className="px-4 py-3 text-left font-semibold">날짜</th>
                <th className="px-4 py-3 text-right font-semibold">
                  참여자 수
                </th>
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
                    {event.organizer_name}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {formatDate(event.event_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {event.participant_count}
                    {event.max_participants !== null
                      ? `/${event.max_participants}`
                      : ""}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {formatDate(event.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <AdminDeleteButton
                      label={event.title}
                      onDelete={deleteEventAction.bind(null, event.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminEventsPage() {
  return (
    <Suspense>
      <AdminEventsContent />
    </Suspense>
  );
}
