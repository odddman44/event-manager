import Link from "next/link";
import Image from "next/image";
import type { EventWithParticipantCount } from "@/src/types";
import { formatEventDate } from "@/src/lib/format-event-date";

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

interface EventCardProps {
  event: EventWithParticipantCount;
  href: string;
}

export function EventCard({ event, href }: EventCardProps) {
  const status = getStatusBadge(
    event.participant_count,
    event.max_participants,
  );

  return (
    <Link
      href={href}
      className="rounded-card bg-card block overflow-hidden border p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative mb-3 h-32 w-full overflow-hidden rounded-md">
        <Image
          src={event.cover_image_url ?? "/images/default-event-cover.svg"}
          alt={event.title}
          fill
          className="object-cover"
        />
      </div>

      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{event.title}</h2>
        <span
          className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="text-muted-foreground space-y-1 text-sm">
        <p>📅 {formatEventDate(event)}</p>
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
}
