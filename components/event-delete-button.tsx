"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteEventAction } from "@/src/controllers/event-controller";

interface EventDeleteButtonProps {
  eventId: string;
  eventTitle: string;
}

export function EventDeleteButton({
  eventId,
  eventTitle,
}: EventDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `"${eventTitle}" 이벤트를 삭제할까요?\n참여자 정보도 함께 삭제되며 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    // 성공 시 액션이 /dashboard로 redirect하므로 이 아래는 실패한 경우에만 실행된다
    const result = await deleteEventAction(eventId);
    setIsDeleting(false);
    if (result && !result.success) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-red-500 hover:bg-red-50 hover:text-red-600"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? "삭제 중..." : "삭제"}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
