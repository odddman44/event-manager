import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { AdminEventSummary, AdminUserSummary, Profile } from "../types";
import {
  countEvents as countEventsRepository,
  countUsers as countUsersRepository,
  countParticipants as countParticipantsRepository,
  countUpcomingEvents as countUpcomingEventsRepository,
  listEventsWithOrganizer as listEventsWithOrganizerRepository,
  listRecentUsers as listRecentUsersRepository,
  listUsersWithEventCounts as listUsersWithEventCountsRepository,
  deleteUser as deleteUserRepository,
  getEventCreationTrend as getEventCreationTrendRepository,
  getUserSignUpTrend as getUserSignUpTrendRepository,
  getEventStatusDistribution as getEventStatusDistributionRepository,
  getTopEventsByParticipants as getTopEventsByParticipantsRepository,
  type TrendPoint,
  type StatusSlice,
  type TopEvent,
} from "../repositories/admin-repository";

export interface DashboardStats {
  totalEvents: number;
  totalUsers: number;
  totalParticipants: number;
  upcomingEvents: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentEvents: AdminEventSummary[];
  recentUsers: Profile[];
}

export async function getDashboardData(
  supabase: SupabaseClient<Database>,
): Promise<DashboardData> {
  const [
    totalEvents,
    totalUsers,
    totalParticipants,
    upcomingEvents,
    recentEvents,
    recentUsers,
  ] = await Promise.all([
    countEventsRepository(supabase),
    countUsersRepository(supabase),
    countParticipantsRepository(supabase),
    countUpcomingEventsRepository(supabase),
    listEventsWithOrganizerRepository(supabase, 3),
    listRecentUsersRepository(supabase, 3),
  ]);

  return {
    stats: { totalEvents, totalUsers, totalParticipants, upcomingEvents },
    recentEvents,
    recentUsers,
  };
}

export async function listAllEvents(
  supabase: SupabaseClient<Database>,
): Promise<AdminEventSummary[]> {
  return listEventsWithOrganizerRepository(supabase);
}

export async function listAllUsers(
  supabase: SupabaseClient<Database>,
): Promise<AdminUserSummary[]> {
  return listUsersWithEventCountsRepository(supabase);
}

export async function deleteUser(userId: string): Promise<void> {
  return deleteUserRepository(userId);
}

export interface StatsData {
  eventTrend: TrendPoint[];
  userTrend: TrendPoint[];
  statusDistribution: StatusSlice[];
  topEvents: TopEvent[];
}

const STATS_TREND_DAYS = 30;
const STATS_TOP_EVENTS_LIMIT = 5;

export async function getStatsData(
  supabase: SupabaseClient<Database>,
): Promise<StatsData> {
  const [eventTrend, userTrend, statusDistribution, topEvents] =
    await Promise.all([
      getEventCreationTrendRepository(supabase, STATS_TREND_DAYS),
      getUserSignUpTrendRepository(supabase, STATS_TREND_DAYS),
      getEventStatusDistributionRepository(supabase),
      getTopEventsByParticipantsRepository(supabase, STATS_TOP_EVENTS_LIMIT),
    ]);

  return { eventTrend, userTrend, statusDistribution, topEvents };
}
