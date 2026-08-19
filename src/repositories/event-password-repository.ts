import { createAdminClient } from "../../lib/supabase/admin";

// event_passwords는 RLS만 켜져 있고 정책이 하나도 없다 — publishable key로는 아예
// 접근이 안 되므로 이 파일의 모든 함수는 admin client로만 동작한다.

export async function upsertEventPassword(
  eventId: string,
  passwordHash: string,
): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("event_passwords")
    .upsert({ event_id: eventId, password_hash: passwordHash });
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteEventPassword(eventId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("event_passwords")
    .delete()
    .eq("event_id", eventId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getEventPasswordHash(
  eventId: string,
): Promise<string | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("event_passwords")
    .select("password_hash")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.password_hash ?? null;
}
