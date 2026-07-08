import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { AdminEventSummary, AdminUserSummary, Profile } from "../types";
import { createAdminClient } from "../../lib/supabase/admin";

export async function countEvents(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countUsers(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countParticipants(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countUpcomingEvents(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .gte("event_date", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listEventsWithOrganizer(
  supabase: SupabaseClient<Database>,
  limit?: number,
): Promise<AdminEventSummary[]> {
  let query = supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (limit) {
    query = query.limit(limit);
  }

  const { data: events, error } = await query;
  if (error) throw new Error(error.message);
  if (!events || events.length === 0) return [];

  const organizerIds = [...new Set(events.map((event) => event.organizer_id))];
  const { data: organizers, error: organizerError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", organizerIds);
  if (organizerError) throw new Error(organizerError.message);

  const nameByOrganizerId = new Map(
    (organizers ?? []).map((organizer) => [
      organizer.id,
      organizer.full_name ?? "알 수 없음",
    ]),
  );

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );
  if (participantsError) throw new Error(participantsError.message);

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    organizer_name: nameByOrganizerId.get(event.organizer_id) ?? "알 수 없음",
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}

export async function listRecentUsers(
  supabase: SupabaseClient<Database>,
  limit?: number,
): Promise<Profile[]> {
  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function listUsersWithEventCounts(
  supabase: SupabaseClient<Database>,
): Promise<AdminUserSummary[]> {
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!users || users.length === 0) return [];

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("organizer_id");
  if (eventsError) throw new Error(eventsError.message);

  const countByOrganizerId = new Map<string, number>();
  for (const event of events ?? []) {
    countByOrganizerId.set(
      event.organizer_id,
      (countByOrganizerId.get(event.organizer_id) ?? 0) + 1,
    );
  }

  return (users as Profile[]).map((user) => ({
    ...user,
    created_events_count: countByOrganizerId.get(user.id) ?? 0,
  }));
}

// service_role 키로 auth.users를 직접 삭제 (profiles는 on delete cascade로 함께 삭제됨)
export async function deleteUser(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
