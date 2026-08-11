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
  // 감싸인 실제 버튼을 클릭했을 때도 전체 온보딩을 완료 처리할지 여부.
  // 1단계(이벤트 만들기)는 false — 버튼을 눌러도 온보딩이 끝난 게 아니라 다음
  // 단계(2단계)로 넘어가는 것뿐이라 로컬로만 닫는다. 2단계(링크 복사)는 true —
  // 이게 투어의 마지막 단계라 실제 행동 자체가 완료다.
  completeOnChildClick: boolean;
}

// 실제 화면 요소(children) 위에 항상 열려 있는 안내 말풍선을 띄운다. ✕는 항상
// 온보딩 전체를 완료 처리하지만, 감싸인 실제 버튼 클릭은 completeOnChildClick에
// 따라 다르게 동작한다 — 트리를 교체하지 않고 Popover의 open만 상태로 제어해서
// children이 언마운트되지 않도록 한다(그래야 예: CopyLinkButton의 "복사됨!" 같은
// 내부 상태가 클릭 이후에도 유지된다).
export function OnboardingCallout({
  message,
  onDismiss,
  children,
  completeOnChildClick,
}: OnboardingCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  function handleXClick() {
    setDismissed(true);
    startTransition(() => {
      onDismiss();
    });
  }

  function handleChildClick() {
    setDismissed(true);
    if (completeOnChildClick) {
      startTransition(() => {
        onDismiss();
      });
    }
  }

  return (
    <Popover open={!dismissed}>
      <PopoverAnchor asChild>
        <span onClickCapture={handleChildClick} className="inline-block">
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
            onClick={handleXClick}
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
