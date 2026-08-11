"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

interface OnboardingCalloutProps {
  message: string;
  onDismiss: () => Promise<void>;
  children: React.ReactNode;
}

// 실제 화면 요소(children) 위에 항상 열려 있는 안내 말풍선을 띄운다. ✕를 누르거나
// children 안의 실제 버튼을 클릭하면(둘 중 어느 쪽이든) 온보딩 완료로 기록하고
// 사라진다 — "다음" 버튼이 따로 없다. 실제 행동을 하는 것 자체가 다음 단계로의
// 이동이기 때문이다.
export function OnboardingCallout({
  message,
  onDismiss,
  children,
}: OnboardingCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) {
    return <>{children}</>;
  }

  function handleDismiss() {
    setDismissed(true); // 낙관적으로 즉시 닫는다 — 서버 액션이 실패해도 사용자는 못 느낀다
    startTransition(() => {
      onDismiss();
    });
  }

  return (
    <Popover open>
      <PopoverAnchor asChild>
        <span onClickCapture={handleDismiss} className="inline-block">
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        onInteractOutside={(e) => e.preventDefault()}
        className="w-64"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">{message}</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="건너뛰기"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
