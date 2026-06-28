"use client";

import { Button } from "@/components/ui/button";

interface AdminDeleteButtonProps {
  // 삭제 대상 이름 (확인 메시지에 활용 가능)
  label: string;
}

export function AdminDeleteButton({ label }: AdminDeleteButtonProps) {
  const handleDelete = () => {
    const confirmed = window.confirm(`${label}을(를) 삭제하시겠습니까?`);
    if (confirmed) {
      alert("삭제 기능은 준비 중입니다.");
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      삭제
    </Button>
  );
}
