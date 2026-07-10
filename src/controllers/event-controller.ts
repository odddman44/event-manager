"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEventSchema, type CreateEventInput } from "../lib/validations";
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
} from "../services/event-service";

type EventActionResult = { success: false; error: string };

export async function createEventAction(
  input: CreateEventInput,
  coverImage?: File,
): Promise<EventActionResult | void> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub;
  if (!organizerId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  let event;
  try {
    event = await createEventService(
      supabase,
      organizerId,
      parsed.data,
      coverImage,
    );
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "이벤트 생성 중 오류가 발생했습니다.",
    };
  }

  redirect(`/events/${event.id}`);
}

export async function updateEventAction(
  eventId: string,
  input: CreateEventInput,
  coverImage?: File,
): Promise<EventActionResult | void> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub;
  if (!organizerId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  try {
    await updateEventService(
      supabase,
      eventId,
      organizerId,
      parsed.data,
      coverImage,
    );
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "이벤트 수정 중 오류가 발생했습니다.",
    };
  }

  redirect(`/events/${eventId}`);
}
