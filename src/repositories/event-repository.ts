import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateEventDto,
  UpdateEventDto,
  Event,
  EventWithParticipantCount,
  Participant,
} from "../types";
import { createAdminClient } from "../../lib/supabase/admin";

export async function createEvent(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  dto: CreateEventDto,
): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
    .insert({
      organizer_id: organizerId,
      title: dto.title,
      description: dto.description ?? null,
      event_date: dto.event_date,
      end_date: dto.end_date ?? null,
      location: dto.location ?? null,
      max_participants: dto.max_participants ?? null,
      cover_image_url: dto.cover_image_url ?? null,
      members_only: dto.members_only ?? false,
      has_password: dto.has_password ?? false,
      // share_token은 DB 기본값이 자동 생성
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "이벤트 생성에 실패했습니다.");
  }
  return data;
}

export async function uploadCoverImage(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${organizerId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("event-covers")
    .upload(path, file);

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
  return data.publicUrl;
}

const COVER_BUCKET = "event-covers";

// 저장된 public URL에서 버킷 내부 경로(`{organizerId}/{uuid}.{ext}`)를 다시 뽑아낸다.
// 형식이 예상과 다르면(외부 URL 등) null을 반환해 호출부가 조용히 건너뛰게 한다.
function extractCoverPath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const path = publicUrl.slice(index + marker.length);
  return path.length > 0 ? path : null;
}

// 커버 교체/이벤트 삭제 후 남는 고아 파일을 정리한다. 정리 실패가 본 작업(수정/삭제)을
// 되돌리게 해서는 안 되므로 에러를 삼킨다.
export async function deleteCoverImage(
  supabase: SupabaseClient<Database>,
  publicUrl: string,
): Promise<void> {
  const path = extractCoverPath(publicUrl);
  if (!path) {
    return;
  }
  await supabase.storage.from(COVER_BUCKET).remove([path]);
}

export async function listEventsByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<EventWithParticipantCount[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .order("event_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!events || events.length === 0) {
    return [];
  }

  // 이미 이 주최자의 이벤트 id로만 필터링된 뒤의 단순 집계지만, participants SELECT
  // 자체가 RLS로 막혀있어 admin 클라이언트가 필요하다.
  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}

// 이 주최자가 만든 이벤트 중 가장 먼저 생성된 것의 id. 동시 생성 시 id 오름차순으로
// tie-break해서(Task 1의 countRegisteredBefore와 같은 관례) 결정적으로 만든다.
export async function getEarliestEventIdByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

export async function getEventById(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Event | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getEventByShareToken(
  supabase: SupabaseClient<Database>,
  shareToken: string,
): Promise<Event | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function deleteEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    throw new Error(error.message);
  }
}

// getEventDetail 서비스가 event.organizer_id === organizerId를 이미 확인한 뒤 호출한다.
export async function listParticipantsByEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Participant[]> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function updateEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
  dto: UpdateEventDto,
): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
    .update({
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.event_date !== undefined && { event_date: dto.event_date }),
      ...(dto.end_date !== undefined && { end_date: dto.end_date }),
      ...(dto.location !== undefined && { location: dto.location ?? null }),
      ...(dto.max_participants !== undefined && {
        max_participants: dto.max_participants ?? null,
      }),
      ...(dto.cover_image_url !== undefined && {
        cover_image_url: dto.cover_image_url ?? null,
      }),
      ...(dto.members_only !== undefined && {
        members_only: dto.members_only,
      }),
      ...(dto.has_password !== undefined && {
        has_password: dto.has_password,
      }),
    })
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "이벤트 수정에 실패했습니다.");
  }
  return data;
}

// 내가 참여한(등록 상태) 이벤트. 본인이 주최한 이벤트는 "내가 만든 이벤트"와 중복되므로 제외한다.
// app/dashboard/page.tsx가 자기 세션 userId만 넘긴다(비로그인은 미들웨어가 이미 차단).
export async function listEventsByParticipantUserId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EventWithParticipantCount[]> {
  const adminClient = createAdminClient();
  const { data: myParticipations, error: participationError } =
    await adminClient
      .from("participants")
      .select("event_id")
      .eq("user_id", userId)
      .eq("status", "registered");

  if (participationError) {
    throw new Error(participationError.message);
  }

  const eventIds = [
    ...new Set((myParticipations ?? []).map((row) => row.event_id)),
  ];
  if (eventIds.length === 0) {
    return [];
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .in("id", eventIds)
    .neq("organizer_id", userId)
    .order("event_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!events || events.length === 0) {
    return [];
  }

  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}
