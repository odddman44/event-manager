import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateParticipantDto,
  Event,
  Participant,
  ParticipantStatus,
} from "../types";
import {
  getEventByShareToken as getEventByShareTokenRepository,
  getEventById as getEventByIdRepository,
} from "../repositories/event-repository";
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  countRegisteredBefore as countRegisteredBeforeRepository,
  createParticipant as createParticipantRepository,
  hardDeleteParticipant as hardDeleteParticipantRepository,
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
  existingParticipant: {
    guestToken: string;
    name: string;
    memo: string | null;
    status: ParticipantStatus;
  } | null;
}

export async function getJoinPageData(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  userId?: string | null,
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

  let existingParticipant: JoinPageData["existingParticipant"] = null;
  if (userId) {
    const participant = await getParticipantByEventAndUserRepository(
      supabase,
      event.id,
      userId,
    );
    if (participant) {
      existingParticipant = {
        guestToken: participant.guest_token,
        name: participant.name,
        memo: participant.memo,
        status: participant.status,
      };
    }
  }

  return { event, registeredCount, isFull, existingParticipant };
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
      return reactivateParticipationRepository(existing.guest_token, userId);
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

  const created = await createParticipantRepository(
    supabase,
    event.id,
    {
      name: dto.name,
      memo: emptyToUndefined(dto.memo),
    },
    userId,
  );

  // 사전 카운트만으로는 동시 요청을 막지 못한다(카운트와 insert 사이에 다른 요청이 끼어든다).
  // 만들어진 뒤 자기 순번을 확인해, 정원을 넘겼다면 자기 행을 되돌리고 거절한다.
  // 경쟁한 요청들이 각자 자기 순번을 독립적으로 계산하므로 정확히 정원만큼만 살아남는다.
  if (event.max_participants !== null) {
    try {
      const rank = await countRegisteredBeforeRepository(
        supabase,
        event.id,
        created.created_at,
        created.id,
      );
      if (rank >= event.max_participants) {
        await hardDeleteParticipantRepository(created.id);
        throw new Error("이 이벤트는 정원이 가득 찼습니다.");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "이 이벤트는 정원이 가득 찼습니다."
      ) {
        throw error;
      }
      // 사후 검증(순번 조회/삭제) 자체가 실패하면 orphan 행을 남기지 않기 위해
      // best-effort로 자기 행 삭제를 시도하고(실패해도 무시), 사용자에게는 raw 에러 대신
      // 일반적인 안내 메시지를 던진다(fail-closed).
      await hardDeleteParticipantRepository(created.id).catch(() => {});
      throw new Error(
        "참여 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  return created;
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
  userId?: string | null,
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

  return reactivateParticipationRepository(guestToken, userId);
}

export async function countRegisteredByEventId(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  return countRegisteredParticipantsRepository(supabase, eventId);
}
