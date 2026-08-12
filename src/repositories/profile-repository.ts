import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

export async function getOnboardingCompletedAt(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data.onboarding_completed_at;
}

export async function getFullName(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data.full_name;
}

// 온보딩 완료 기록. profiles에는 이미 "Users can update their own profile" UPDATE
// 정책이 있어(20260622094718_fix_profiles_advisor_warnings.sql) 일반 요청 클라이언트로
// 충분하다 — service_role 클라이언트 불필요.
export async function completeOnboarding(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
