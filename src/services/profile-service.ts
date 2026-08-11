import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import {
  getOnboardingCompletedAt as getOnboardingCompletedAtRepository,
  completeOnboarding as completeOnboardingRepository,
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
