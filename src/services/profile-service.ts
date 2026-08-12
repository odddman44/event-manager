import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import {
  getOnboardingCompletedAt as getOnboardingCompletedAtRepository,
  completeOnboarding as completeOnboardingRepository,
  getFullName as getFullNameRepository,
} from "../repositories/profile-repository";

// 온보딩 조회 실패가 페이지 렌더링을 막으면 안 되므로, 에러가 나면 "이미 완료됨"으로
// 처리해 온보딩을 노출하지 않는다 — 장식적 기능이라 fail-safe 쪽이 안전하다.
export async function isOnboardingPending(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  try {
    const completedAt = await getOnboardingCompletedAtRepository(
      supabase,
      userId,
    );
    return completedAt === null;
  } catch {
    return false;
  }
}

export async function completeOnboarding(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await completeOnboardingRepository(supabase, userId);
}

// 참여 페이지에서 로그인 사용자의 이름을 미리 채워주기 위한 용도. 조회 실패 시
// 빈 문자열로 대체한다 — 이름 자동입력은 편의 기능이라 실패가 참여 자체를 막으면 안 된다.
export async function getFullName(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  try {
    return (await getFullNameRepository(supabase, userId)) ?? "";
  } catch {
    return "";
  }
}
