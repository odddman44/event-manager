import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateEventInput } from "../lib/validations";
import { validateCoverImage } from "../lib/validations";
import type { Event, EventWithParticipantCount, Participant } from "../types";
import {
  createEvent as createEventRepository,
  updateEvent as updateEventRepository,
  uploadCoverImage as uploadCoverImageRepository,
  deleteCoverImage as deleteCoverImageRepository,
  listEventsByOrganizer as listEventsByOrganizerRepository,
  getEarliestEventIdByOrganizer as getEarliestEventIdByOrganizerRepository,
  getEventById as getEventByIdRepository,
  listParticipantsByEvent as listParticipantsByEventRepository,
  deleteEvent as deleteEventRepository,
  listEventsByParticipantUserId as listEventsByParticipantUserIdRepository,
} from "../repositories/event-repository";

function emptyToUndefined(value?: string): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export async function createEvent(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  input: CreateEventInput,
  coverImageFile?: File,
): Promise<Event> {
  let coverImageUrl: string | undefined;
  if (coverImageFile) {
    const validationError = validateCoverImage(coverImageFile);
    if (validationError) {
      throw new Error(validationError);
    }
    coverImageUrl = await uploadCoverImageRepository(
      supabase,
      organizerId,
      coverImageFile,
    );
  }

  return createEventRepository(supabase, organizerId, {
    title: input.title,
    description: emptyToUndefined(input.description),
    event_date: input.event_date,
    location: emptyToUndefined(input.location),
    max_participants: input.max_participants,
    cover_image_url: coverImageUrl,
    members_only: input.members_only,
  });
}

export async function listEventsByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<EventWithParticipantCount[]> {
  return listEventsByOrganizerRepository(supabase, organizerId);
}

// 조회 실패 시 온보딩을 노출하지 않는 쪽(false)이 안전하다.
export async function isFirstEventForOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  eventId: string,
): Promise<boolean> {
  try {
    const earliestId = await getEarliestEventIdByOrganizerRepository(
      supabase,
      organizerId,
    );
    return earliestId === eventId;
  } catch {
    return false;
  }
}

export interface EventDetail {
  event: Event;
  participants: Participant[];
}

// 주최자 본인이 아니면 null 반환 (존재하지 않는 이벤트와 동일하게 처리해 정보 노출 방지)
export async function getEventDetail(
  supabase: SupabaseClient<Database>,
  eventId: string,
  organizerId: string,
): Promise<EventDetail | null> {
  const event = await getEventByIdRepository(supabase, eventId);
  if (!event || event.organizer_id !== organizerId) {
    return null;
  }

  const participants = await listParticipantsByEventRepository(
    supabase,
    eventId,
  );
  return { event, participants };
}

export async function deleteEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<void> {
  return deleteEventRepository(supabase, eventId);
}

// 주최자 본인이 아니면 에러 (getEventDetail/updateEvent와 동일한 소유자 검증 패턴)
export async function deleteEventByOrganizer(
  supabase: SupabaseClient<Database>,
  eventId: string,
  organizerId: string,
): Promise<void> {
  const event = await getEventByIdRepository(supabase, eventId);
  if (!event || event.organizer_id !== organizerId) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }

  await deleteEventRepository(supabase, eventId);
  // 이벤트 행이 사라진 뒤에는 이 커버를 참조할 곳이 없다.
  if (event.cover_image_url) {
    await deleteCoverImageRepository(supabase, event.cover_image_url);
  }
}

// 주최자 본인이 아니면 에러 (getEventDetail과 동일한 소유자 검증 패턴)
export async function updateEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
  organizerId: string,
  input: CreateEventInput,
  coverImageFile?: File,
): Promise<Event> {
  const event = await getEventByIdRepository(supabase, eventId);
  if (!event || event.organizer_id !== organizerId) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }

  let coverImageUrl = event.cover_image_url ?? undefined;
  if (coverImageFile) {
    const validationError = validateCoverImage(coverImageFile);
    if (validationError) {
      throw new Error(validationError);
    }
    coverImageUrl = await uploadCoverImageRepository(
      supabase,
      organizerId,
      coverImageFile,
    );
    // 새 파일 업로드가 성공한 뒤에 이전 파일을 지운다. 순서를 뒤집으면 업로드가
    // 실패했을 때 이벤트가 커버를 잃는다.
    if (event.cover_image_url) {
      await deleteCoverImageRepository(supabase, event.cover_image_url);
    }
  }

  return updateEventRepository(supabase, eventId, {
    title: input.title,
    description: emptyToUndefined(input.description),
    event_date: input.event_date,
    location: emptyToUndefined(input.location),
    max_participants: input.max_participants,
    cover_image_url: coverImageUrl,
    members_only: input.members_only,
  });
}

export async function listParticipatedEvents(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EventWithParticipantCount[]> {
  return listEventsByParticipantUserIdRepository(supabase, userId);
}
