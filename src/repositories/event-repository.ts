import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateEventDto,
  Event,
  EventWithParticipantCount,
  Participant,
} from "../types";

export async function createEvent(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  dto: CreateEventDto,
): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
    .insert({
      organizer_id: organizerId,
      title: dto.title,
      description: dto.description ?? null,
      event_date: dto.event_date,
      location: dto.location ?? null,
      max_participants: dto.max_participants ?? null,
      // share_token은 DB 기본값이 자동 생성
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "이벤트 생성에 실패했습니다.");
  }
  return data;
}

export async function listEventsByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<EventWithParticipantCount[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  if (!events || events.length === 0) {
    return [];
  }

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}

export async function getEventById(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Event | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getEventByShareToken(
  supabase: SupabaseClient<Database>,
  shareToken: string,
): Promise<Event | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function deleteEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listParticipantsByEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
