import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateParticipantDto, Event, Participant } from "../types";
import { getEventByShareToken as getEventByShareTokenRepository } from "../repositories/event-repository";
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  createParticipant as createParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
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
): Promise<Participant> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
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

  return createParticipantRepository(supabase, event.id, {
    name: dto.name,
    memo: emptyToUndefined(dto.memo),
  });
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
