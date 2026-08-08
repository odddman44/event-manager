"use server";

import { createClient } from "@/lib/supabase/server";
import {
  joinEventSchema,
  type JoinEventInput,
  updateParticipantMemoSchema,
} from "../lib/validations";
import {
  joinEvent as joinEventService,
  getParticipantByGuestToken as getParticipantByGuestTokenService,
  updateParticipantMemo as updateParticipantMemoService,
  cancelParticipation as cancelParticipationService,
  reactivateParticipation as reactivateParticipationService,
  countRegisteredByEventId as countRegisteredByEventIdService,
} from "../services/participant-service";
import type { ParticipantStatus } from "../types";

type JoinEventResult =
  | {
      success: true;
      guestToken: string;
      name: string;
      registeredCount: number;
    }
  | { success: false; error: string };

export async function joinEventAction(
  shareToken: string,
  input: JoinEventInput,
): Promise<JoinEventResult> {
  const parsed = joinEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const supabase = await createClient();
  // 로그인 상태면 참여를 계정에 연결한다 (비로그인이면 null — 기존 guest_token 흐름 그대로)
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  try {
    const participant = await joinEventService(
      supabase,
      shareToken,
      parsed.data,
      userId,
    );
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return {
      success: true,
      guestToken: participant.guest_token,
      name: participant.name,
      registeredCount,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "참여 신청에 실패했습니다.",
    };
  }
}

type GetParticipantResult =
  | {
      success: true;
      participant: {
        name: string;
        memo: string | null;
        status: ParticipantStatus;
      };
    }
  | { success: false };

export async function getParticipantByGuestTokenAction(
  guestToken: string,
): Promise<GetParticipantResult> {
  const supabase = await createClient();
  const participant = await getParticipantByGuestTokenService(
    supabase,
    guestToken,
  );
  if (!participant) {
    return { success: false };
  }
  return {
    success: true,
    participant: {
      name: participant.name,
      memo: participant.memo,
      status: participant.status,
    },
  };
}

type ActionResult = { success: true } | { success: false; error: string };

type CountedActionResult =
  | { success: true; registeredCount: number }
  | { success: false; error: string };

export async function updateParticipantMemoAction(
  guestToken: string,
  memo: string,
): Promise<ActionResult> {
  const parsed = updateParticipantMemoSchema.safeParse({ memo });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  try {
    await updateParticipantMemoService(guestToken, parsed.data.memo);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "메모 저장에 실패했습니다.",
    };
  }
}

export async function cancelParticipationAction(
  guestToken: string,
): Promise<CountedActionResult> {
  const supabase = await createClient();
  try {
    const participant = await cancelParticipationService(guestToken);
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return { success: true, registeredCount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "참여 취소에 실패했습니다.",
    };
  }
}

export async function reactivateParticipationAction(
  guestToken: string,
): Promise<CountedActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  try {
    const participant = await reactivateParticipationService(
      supabase,
      guestToken,
      userId,
    );
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return { success: true, registeredCount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "재참여에 실패했습니다.",
    };
  }
}
