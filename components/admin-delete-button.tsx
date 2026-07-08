"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AdminDeleteButtonProps {
  // 삭제 대상 이름 (확인 메시지에 활용)
  label: string;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

export function AdminDeleteButton({ label, onDelete }: AdminDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    const confirmed = window.confirm(`${label}을(를) 삭제하시겠습니까?`);
    if (!confirmed) return;

    setIsDeleting(true);
    const result = await onDelete();
    setIsDeleting(false);

    if (!result.success) {
      alert(result.error ?? "삭제에 실패했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "삭제 중..." : "삭제"}
    </Button>
  );
}
