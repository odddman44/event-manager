import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateParticipantDto, Event, Participant } from "../types";
import {
  getEventByShareToken as getEventByShareTokenRepository,
  getEventById as getEventByIdRepository,
} from "../repositories/event-repository";
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  createParticipant as createParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  getParticipantByEventAndUser as getParticipantByEventAndUserRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
  reactivateParticipation as reactivateParticipationRepository,
} from "../repositories/participant-repository";

function emptyToUndefined(value?: string): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export interface JoinPageData {
  event: Event;
  registeredCount: number;
  isFull: boolean;
}

export async function getJoinPageData(
  supabase: SupabaseClient<Database>,
  shareToken: string,
): Promise<JoinPageData | null> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    return null;
  }

  const registeredCount = await countRegisteredParticipantsRepository(
    supabase,
    event.id,
  );
  const isFull =
    event.max_participants !== null &&
    registeredCount >= event.max_participants;

  return { event, registeredCount, isFull };
}

export async function joinEvent(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  // 로그인 사용자가 이 이벤트에 이미 참여한 적이 있다면 새 레코드를 만들지 않는다.
  // (다른 기기에서 같은 링크를 다시 열어 참여를 시도하는 경우 중복 생성을 막기 위함)
  if (userId) {
    const existing = await getParticipantByEventAndUserRepository(
      supabase,
      event.id,
      userId,
    );
    if (existing) {
      if (existing.status === "registered") {
        return existing;
      }
      // 취소했던 참여였다면 재활성화한다 (reactivateParticipation과 동일한 정원 재검증)
      if (event.max_participants !== null) {
        const registeredCount = await countRegisteredParticipantsRepository(
          supabase,
          event.id,
        );
        if (registeredCount >= event.max_participants) {
          throw new Error("이 이벤트는 정원이 가득 찼습니다.");
        }
      }
      return reactivateParticipationRepository(existing.guest_token);
    }
  }

  if (event.max_participants !== null) {
    const registeredCount = await countRegisteredParticipantsRepository(
      supabase,
      event.id,
    );
    if (registeredCount >= event.max_participants) {
      throw new Error("이 이벤트는 정원이 가득 찼습니다.");
    }
  }

  return createParticipantRepository(
    supabase,
    event.id,
    {
      name: dto.name,
      memo: emptyToUndefined(dto.memo),
    },
    userId,
  );
}

export async function getParticipantByGuestToken(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant | null> {
  return getParticipantByGuestTokenRepository(supabase, guestToken);
}

export async function updateParticipantMemo(
  guestToken: string,
  memo?: string,
): Promise<Participant> {
  return updateParticipantMemoRepository(guestToken, emptyToUndefined(memo));
}

export async function cancelParticipation(
  guestToken: string,
): Promise<Participant> {
  return cancelParticipationRepository(guestToken);
}

// 취소했던 참여를 되살린다. 새 레코드를 만들면 주최자 목록에 취소 이력이 중복으로 쌓이므로
// 기존 row의 status만 되돌리고 guest_token은 그대로 유지한다.
export async function reactivateParticipation(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant> {
  const participant = await getParticipantByGuestTokenRepository(
    supabase,
    guestToken,
  );
  if (!participant) {
    throw new Error("참여 정보를 찾을 수 없습니다.");
  }

  const event = await getEventByIdRepository(supabase, participant.event_id);
  if (!event) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }

  if (event.max_participants !== null) {
    const registeredCount = await countRegisteredParticipantsRepository(
      supabase,
      event.id,
    );
    if (registeredCount >= event.max_participants) {
      throw new Error("이 이벤트는 정원이 가득 찼습니다.");
    }
  }

  return reactivateParticipationRepository(guestToken);
}

export async function countRegisteredByEventId(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  return countRegisteredParticipantsRepository(supabase, eventId);
}
