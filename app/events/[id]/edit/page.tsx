import { redirect } from "next/navigation";
import EventForm from "@/components/event-form";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/src/services/event-service";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub as string;

  const detail = await getEventDetail(supabase, id, organizerId);
  if (!detail) {
    redirect("/dashboard");
  }
  const { event } = detail;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">이벤트 수정</h1>

      <div className="rounded-card bg-card border p-6 shadow-sm">
        <EventForm
          mode="edit"
          eventId={event.id}
          defaultValues={{
            title: event.title,
            description: event.description ?? "",
            event_date: event.event_date,
            location: event.location ?? "",
            max_participants: event.max_participants ?? undefined,
          }}
          existingCoverImageUrl={event.cover_image_url}
        />
      </div>
    </div>
  );
}
