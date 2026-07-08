"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { deleteEvent as deleteEventService } from "../services/event-service";
import { deleteUser as deleteUserService } from "../services/admin-service";

type ActionResult = { success: true } | { success: false; error: string };
type AdminCheckResult =
  | { success: true; userId: string }
  | { success: false; error: string };

async function requireAdmin(
  supabase: SupabaseClient<Database>,
): Promise<AdminCheckResult> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    return { success: false, error: "관리자만 접근할 수 있습니다." };
  }
  return { success: true, userId };
}

export async function deleteEventAction(
  eventId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const authCheck = await requireAdmin(supabase);
  if (!authCheck.success) {
    return authCheck;
  }

  try {
    await deleteEventService(supabase, eventId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "삭제에 실패했습니다.",
    };
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const authCheck = await requireAdmin(supabase);
  if (!authCheck.success) {
    return authCheck;
  }
  if (authCheck.userId === userId) {
    return { success: false, error: "본인 계정은 삭제할 수 없습니다." };
  }

  try {
    await deleteUserService(userId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "삭제에 실패했습니다.",
    };
  }
}
