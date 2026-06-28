import EventForm from "@/components/event-form";

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-lg">
      {/* 페이지 제목 */}
      <h1 className="mb-6 text-2xl font-bold">새 이벤트 만들기</h1>

      {/* 폼 카드 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <EventForm />
      </div>
    </div>
  );
}
