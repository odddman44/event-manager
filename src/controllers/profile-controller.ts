"use server";

import { createClient } from "@/lib/supabase/server";
import { completeOnboarding as completeOnboardingService } from "../services/profile-service";

// 온보딩 말풍선은 클라이언트에서 이미 낙관적으로 닫힌 뒤 호출되므로, 이 액션이
// 실패해도 사용자에게 보여줄 에러가 없다. 인증되지 않은 상태로 호출되는 경우는
// 이론상 없지만 방어적으로 조용히 무시한다.
export async function completeOnboardingAction(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return;
  }

  try {
    await completeOnboardingService(supabase, userId);
  } catch {
    // 온보딩 완료 기록 실패는 사용자 경험에 영향 없음 — 조용히 무시
  }
}
