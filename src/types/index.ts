export type UserRole = "user" | "admin";

export type ParticipantStatus = "registered" | "cancelled";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  max_participants: number | null;
  cover_image_url: string | null;
  share_token: string;
  created_at: string;
}

export interface Participant {
  id: string;
  event_id: string;
  name: string;
  memo: string | null;
  guest_token: string;
  status: ParticipantStatus;
  created_at: string;
}

// DTO 타입

export interface CreateEventDto {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  event_date?: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
}

export interface CreateParticipantDto {
  name: string;
  memo?: string;
}

export interface UpdateParticipantDto {
  memo?: string;
  status?: ParticipantStatus;
}

export interface SignUpDto {
  full_name: string;
  email: string;
  password: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

// 뷰 모델 (조인 데이터 포함)

export interface EventWithParticipantCount extends Event {
  participant_count: number;
}

export interface EventWithOrganizer extends Event {
  organizer: Pick<Profile, "id" | "full_name" | "email">;
}

export interface AdminEventSummary extends Event {
  organizer_name: string;
  participant_count: number;
}

export interface AdminUserSummary extends Profile {
  created_events_count: number;
}
