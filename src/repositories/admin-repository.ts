import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { AdminEventSummary, AdminUserSummary, Profile } from "../types";
import { createAdminClient } from "../../lib/supabase/admin";

export interface TrendPoint {
  date: string;
  count: number;
}

export interface StatusSlice {
  name: string;
  value: number;
}

export interface TopEvent {
  name: string;
  participants: number;
}

// 차트 X축 라벨 (예: "8/15"). 서버 실행 위치와 무관하게 KST 기준으로 고정한다.
function toKstDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

// Postgres 날짜 그룹핑에는 RPC가 필요해, 행을 가져와 JS에서 집계한다 (데이터 규모가 작음).
// 데이터가 없는 날도 0으로 채워 차트에 구멍이 생기지 않게 한다.
function bucketByDay(
  isoDates: string[],
  since: Date,
  days: number,
): TrendPoint[] {
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(since.getDate() + i);
    buckets.set(toKstDayLabel(day), 0);
  }

  for (const iso of isoDates) {
    const label = toKstDayLabel(new Date(iso));
    if (buckets.has(label)) {
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
  }

  return [...buckets].map(([date, count]) => ({ date, count }));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "days일 전 KST 자정"에 해당하는 실제 UTC 시각을 구한다. 서버가 어느 타임존에서 실행되든
// (Vercel은 UTC) 항상 같은 결과가 나오도록, 로컬 Date 메서드 대신 UTC getter/setter만 사용해
// KST 오프셋을 직접 더하고 뺀다. KST는 서머타임이 없는 고정 UTC+9라 이 계산이 항상 정확하다.
function daysAgoStart(days: number): Date {
  const now = new Date();
  // 현재 UTC 시각에 9시간을 더하면, 그 결과를 UTC 필드로 읽었을 때 "KST 벽시계 값"과 같아진다.
  const kstWallClock = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstWallClock.getUTCFullYear();
  const month = kstWallClock.getUTCMonth();
  const day = kstWallClock.getUTCDate() - (days - 1);
  // 위에서 구한 "KST 캘린더 날짜"의 00:00(KST)에 해당하는 실제 UTC 시각
  // = 그 날짜의 UTC 00:00에서 9시간을 뺀 값
  return new Date(Date.UTC(year, month, day) - KST_OFFSET_MS);
}

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- admin client로 전환되어 미사용, 다른 함수들과 시그니처는 유지한다
  supabase: SupabaseClient<Database>,
): Promise<number> {
  // 취소한 참여자는 제외 — 이벤트 목록의 participant_count와 기준을 맞춘다.
  // admin-controller.ts의 requireAdmin이 상위에서 이미 게이트하지만, participants SELECT
  // 자체가 RLS로 막혀있어 admin 클라이언트가 필요하다.
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("status", "registered");
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

  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
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

export async function getEventCreationTrend(
  supabase: SupabaseClient<Database>,
  days: number,
): Promise<TrendPoint[]> {
  const since = daysAgoStart(days);
  const { data, error } = await supabase
    .from("events")
    .select("created_at")
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);

  return bucketByDay(
    (data ?? []).map((row) => row.created_at),
    since,
    days,
  );
}

export async function getUserSignUpTrend(
  supabase: SupabaseClient<Database>,
  days: number,
): Promise<TrendPoint[]> {
  const since = daysAgoStart(days);
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);

  return bucketByDay(
    (data ?? []).map((row) => row.created_at),
    since,
    days,
  );
}

// events에는 종료 시각이 없어, '진행 중'은 시작 시각이 지났지만 같은 날(KST)인 경우로 정의한다.
export async function getEventStatusDistribution(
  supabase: SupabaseClient<Database>,
): Promise<StatusSlice[]> {
  const { data, error } = await supabase.from("events").select("event_date");
  if (error) throw new Error(error.message);

  const now = new Date();
  const todayLabel = toKstDayLabel(now);

  let upcoming = 0;
  let ongoing = 0;
  let finished = 0;

  for (const row of data ?? []) {
    const eventDate = new Date(row.event_date);
    if (eventDate > now) {
      upcoming += 1;
    } else if (toKstDayLabel(eventDate) === todayLabel) {
      ongoing += 1;
    } else {
      finished += 1;
    }
  }

  return [
    { name: "예정", value: upcoming },
    { name: "진행 중", value: ongoing },
    { name: "종료", value: finished },
  ];
}

export async function getTopEventsByParticipants(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<TopEvent[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title");
  if (error) throw new Error(error.message);
  if (!events || events.length === 0) return [];

  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered");
  if (participantsError) throw new Error(participantsError.message);

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events
    .map((event) => ({
      name: event.title,
      participants: countByEventId.get(event.id) ?? 0,
    }))
    .sort((a, b) => b.participants - a.participants)
    .slice(0, limit);
}
