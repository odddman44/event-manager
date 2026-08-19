"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyEventPasswordAction } from "@/src/controllers/participant-controller";

// 이벤트 정보(제목/날짜 등)는 이 컴포넌트에 애초에 전달되지 않는다 — props가
// shareToken뿐이라 실수로라도 노출할 방법이 없다.
export default function PasswordGate({ shareToken }: { shareToken: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await verifyEventPasswordAction(shareToken, password);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    // 서버 컴포넌트를 다시 실행시켜, 방금 심어진 쿠키가 반영된 getJoinPageData
    // 결과로 다시 렌더링한다(전체 페이지 리로드 없이).
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-card space-y-4 border border-gray-100 bg-white p-6 text-center shadow-sm">
          <Lock className="text-primary mx-auto size-8" />
          <div>
            <h1 className="font-semibold text-gray-800">
              암호로 보호된 모임입니다
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              암호를 입력해야 정보를 볼 수 있어요.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <Label htmlFor="event-password" className="sr-only">
              암호
            </Label>
            <Input
              id="event-password"
              type="password"
              placeholder="암호를 입력해주세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 w-full text-white"
              disabled={isSubmitting || password.length === 0}
            >
              {isSubmitting ? "확인 중..." : "확인"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
