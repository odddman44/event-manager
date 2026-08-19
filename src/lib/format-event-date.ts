interface EventDateRange {
  event_date: string;
  end_date: string | null;
}

// 서버 실행 위치와 무관하게 KST로 고정 표시한다(기존 각 파일의 formatDate 관례 이관).
function formatSingleDate(iso: string, withTime: boolean): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime && { hour: "numeric", minute: "2-digit", hour12: true }),
  });
}

// 여러 날 모임(#4) — end_date가 있으면 "시작일 ~ 종료일"로, 없으면 기존과 동일하게
// 시작일 하나만 표시한다.
export function formatEventDate(
  event: EventDateRange,
  withTime = true,
): string {
  const start = formatSingleDate(event.event_date, withTime);
  if (!event.end_date) {
    return start;
  }
  return `${start} ~ ${formatSingleDate(event.end_date, withTime)}`;
}
