import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateParticipantDto,
  Participant,
  ParticipantRosterEntry,
} from "../types";
import { createAdminClient } from "../../lib/supabase/admin";

export async function countRegisteredParticipants(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered");

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function createParticipant(
  supabase: SupabaseClient<Database>,
  eventId: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const { data, error } = await supabase
    .from("participants")
    .insert({
      event_id: eventId,
      name: dto.name,
      memo: dto.memo ?? null,
      user_id: userId ?? null,
      // guest_token은 DB 기본값이 자동 생성
    })
    .select()
    .single();

  if (error) {
    // 동시 요청으로 (event_id, user_id) 유니크 제약에 걸린 경우 — 이미 참여 중인 기존
    // 레코드를 그대로 반환한다(서비스 레이어의 "먼저 조회" 로직이 놓친 레이스 컨디션 방어)
    if (error.code === "23505" && userId) {
      const existing = await getParticipantByEventAndUser(
        supabase,
        eventId,
        userId,
      );
      if (existing) {
        return existing;
      }
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("참여 신청에 실패했습니다.");
  }
  return data;
}

export async function getParticipantByGuestToken(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("guest_token", guestToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getParticipantByEventAndUser(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string,
): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

// 주어진 참여 레코드보다 먼저 등록된 registered 참여자 수(= 그 레코드의 0-based 순번).
// created_at이 같은 경우 id 사전순으로 tie-break해서, 동시 요청들이 서로 다른 순번을 갖도록 보장한다.
export async function countRegisteredBefore(
  supabase: SupabaseClient<Database>,
  eventId: string,
  createdAt: string,
  id: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered")
    .or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

// guest_token UPDATE는 RLS에서 anon/authenticated 접근을 막아뒀으므로(누구나 임의 row를 수정할 수
// 있던 취약점 차단) service_role 클라이언트로만 수행한다. guest_token 소유자 검증은 WHERE 절이 담당.
export async function updateParticipantMemo(
  guestToken: string,
  memo?: string,
): Promise<Participant> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .update({ memo: memo ?? null })
    .eq("guest_token", guestToken)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "메모 저장에 실패했습니다.");
  }
  return data;
}

export async function cancelParticipation(
  guestToken: string,
): Promise<Participant> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .update({ status: "cancelled" })
    .eq("guest_token", guestToken)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "참여 취소에 실패했습니다.");
  }
  return data;
}

export async function reactivateParticipation(
  guestToken: string,
  userId?: string | null,
): Promise<Participant> {
  const adminClient = createAdminClient();

  // user_id가 이미 채워져 있으면 덮어쓰지 않는다(다른 계정으로 잘못 연결되는 것을 방지) —
  // 비회원으로 참여했다가(user_id null) 로그인 상태로 재참여할 때만 백필한다.
  const updatePayload: { status: "registered"; user_id?: string } = {
    status: "registered",
  };
  if (userId) {
    const { data: current } = await adminClient
      .from("participants")
      .select("event_id, user_id")
      .eq("guest_token", guestToken)
      .maybeSingle();
    if (current && current.user_id === null) {
      // 같은 이벤트에 이 계정의 다른 참여가 이미 있으면 백필이 유니크 제약을 위반해
      // 재참여 자체가 실패한다. 그런 경우엔 계정 연결만 건너뛰고 재참여는 성사시킨다.
      const linked = await getParticipantByEventAndUser(
        adminClient,
        current.event_id,
        userId,
      );
      if (!linked) {
        updatePayload.user_id = userId;
      }
    }
  }

  const { data, error } = await adminClient
    .from("participants")
    .update(updatePayload)
    .eq("guest_token", guestToken)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "재참여에 실패했습니다.");
  }
  return data;
}

// 정원 경쟁에서 밀린 자기 행을 되돌리는 용도. participants에는 anon/authenticated DELETE 정책이
// 없으므로(임의 행 삭제 취약점 차단) service_role 클라이언트로만 수행한다.
export async function hardDeleteParticipant(id: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("participants")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

// registered 참여자만, 이름/회원여부/아바타만 반환한다(memo, guest_token 등은 절대 포함하지
// 않음 — 다른 참여자에게 노출할 정보가 아니다). participants.user_id는 auth.users(id)를
// 참조하고 profiles를 직접 참조하지 않아 PostgREST 중첩 select로 조인이 안 될 수 있으므로,
// 이 리포지토리의 listEventsWithOrganizer(admin-repository.ts)와 동일하게 두 번 쿼리 후
// Map으로 결합한다.
export async function listRegisteredParticipantsForEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<ParticipantRosterEntry[]> {
  const { data: participants, error } = await supabase
    .from("participants")
    .select("name, user_id")
    .eq("event_id", eventId)
    .eq("status", "registered")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!participants || participants.length === 0) {
    return [];
  }

  const memberIds = [
    ...new Set(
      participants
        .map((p) => p.user_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const avatarByUserId = new Map<string, string | null>();
  if (memberIds.length > 0) {
    // profiles는 본인 행만 조회 가능한 RLS 정책만 있어(다른 참여자 조회 불가) 요청자 클라이언트로는
    // 항상 0~1건만 반환된다. 이 명단을 볼 권한 자체는 상위 서비스 레이어에서 이미 검증했으므로,
    // 다른 회원들의 avatar_url 조회에는 admin 클라이언트로 RLS를 우회한다.
    const adminClient = createAdminClient();
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, avatar_url")
      .in("id", memberIds);
    if (profilesError) {
      throw new Error(profilesError.message);
    }
    for (const profile of profiles ?? []) {
      avatarByUserId.set(profile.id, profile.avatar_url);
    }
  }

  return participants.map((p) => ({
    name: p.name,
    isMember: p.user_id !== null,
    avatarUrl: p.user_id ? (avatarByUserId.get(p.user_id) ?? null) : null,
  }));
}
