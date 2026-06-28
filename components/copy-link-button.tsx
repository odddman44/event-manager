"use client";

import { Button } from "@/components/ui/button";

interface CopyLinkButtonProps {
  link: string;
}

export default function CopyLinkButton({ link }: CopyLinkButtonProps) {
  function handleCopy() {
    // Phase 2: 더미 알림 (실제 클립보드 복사는 Phase 7에서 구현)
    alert(`링크가 복사되었습니다:\n${link}`);
    // 실제 환경에서는 아래 코드 사용:
    // navigator.clipboard.writeText(link);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="shrink-0"
      onClick={handleCopy}
    >
      링크 복사
    </Button>
  );
}
