"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  MapPin,
  Users,
  Home,
  Calendar,
  PlusCircle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  joinEventAction,
  getParticipantByGuestTokenAction,
  updateParticipantMemoAction,
  cancelParticipationAction,
} from "@/src/controllers/participant-controller";
import type { Event } from "@/src/types";

// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full";

function guestTokenKey(shareToken: string): string {
  return `moija_guest_token_${shareToken}`;
}

// 날짜 포맷 변환 헬퍼 (서버 렌더링과 클라이언트 하이드레이션이 항상 동일한 값을
// 내도록 실행 환경 타임존과 무관하게 KST로 고정)
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 이벤트 정보 카드 (모든 상태에서 공통 표시)
function EventInfoCard({
  event,
  registeredCount,
}: {
  event: Event;
  registeredCount: number;
}) {
  return (
    <div className="rounded-card overflow-hidden border border-gray-100 bg-white shadow-sm">
      <div className="space-y-3 p-4">
        <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary size-4 shrink-0" />
            <span>{formatDate(event.event_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-primary size-4 shrink-0" />
            <span>{event.location ?? "장소 미정"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="text-primary size-4 shrink-0" />
            <span>
              {registeredCount}
              {event.max_participants !== null
                ? ` / ${event.max_participants}명`
                : "명 (정원 제한 없음)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 모바일 하단 네비게이션 아이템 정의
const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/dashboard", label: "이벤트", icon: Calendar },
  { href: "/events/new", label: "새 이벤트", icon: PlusCircle },
  { href: "/profile", label: "프로필", icon: User },
];

// 인라인 하단 네비게이션 (join 페이지는 별도 레이아웃 없으므로 직접 포함)
function BottomNavInline() {
  const pathname = usePathname();
  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 flex h-16 items-center justify-around border-t border-gray-100 bg-white md:hidden">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 text-xs ${active ? "text-primary" : "text-gray-500"}`}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface JoinFormProps {
  shareToken: string;
  event: Event;
  registeredCount: number;
  isFull: boolean;
}

export default function JoinForm({
  shareToken,
  event,
  registeredCount,
  isFull,
}: JoinFormProps) {
  const [state, setState] = useState<PageState>(isFull ? "full" : "form");
  const [guestToken, setGuestToken] = useState<string | null>(null);

  // 신규 참여 폼 입력값
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 완료 상태에서 저장된 참여자 이름/메모
  const [savedName, setSavedName] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // 재방문 인식: localStorage의 guest_token으로 기존 참여 조회
  useEffect(() => {
    const storedToken = localStorage.getItem(guestTokenKey(shareToken));
    if (!storedToken) {
      return;
    }

    getParticipantByGuestTokenAction(storedToken).then((result) => {
      if (!result.success) {
        // 유효하지 않은 토큰(예: 이벤트 삭제) → 정리 (초기 상태를 그대로 유지)
        localStorage.removeItem(guestTokenKey(shareToken));
        return;
      }

      setGuestToken(storedToken);
      setSavedName(result.participant.name);
      setEditMemo(result.participant.memo ?? "");
      setState(
        result.participant.status === "cancelled" ? "cancelled" : "completed",
      );
    });
  }, [shareToken]);

  // 참여하기 버튼 클릭 → 실제 참여 등록
  async function handleJoin() {
    setError(null);
    setIsSubmitting(true);
    const result = await joinEventAction(shareToken, { name, memo });
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      if (result.error.includes("정원")) {
        setState("full");
      }
      return;
    }

    localStorage.setItem(guestTokenKey(shareToken), result.guestToken);
    setGuestToken(result.guestToken);
    setSavedName(result.name);
    setEditMemo(memo);
    setState("completed");
  }

  // 메모 저장
  async function handleSaveMemo() {
    if (!guestToken) return;
    setIsSavingMemo(true);
    setError(null);
    const result = await updateParticipantMemoAction(guestToken, editMemo);
    setIsSavingMemo(false);
    if (!result.success) {
      setError(result.error);
    }
  }

  // 참여 취소
  async function handleCancel() {
    if (!guestToken) return;
    setIsCancelling(true);
    setError(null);
    const result = await cancelParticipationAction(guestToken);
    setIsCancelling(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setState("cancelled");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-6 pb-20">
      <div className="w-full max-w-sm space-y-4">
        {/* 공통: 이벤트 정보 카드 */}
        <EventInfoCard event={event} registeredCount={registeredCount} />

        {/* State 1: 신규 참여 폼 */}
        {state === "form" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800">참여 신청</h2>
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-primary">*</span>
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Textarea
                id="memo"
                placeholder="전달하고 싶은 말을 적어주세요 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
              onClick={handleJoin}
              disabled={isSubmitting}
            >
              {isSubmitting ? "신청 중..." : "참여하기"}
            </Button>
          </div>
        )}

        {/* State 2: 참여 완료 상태 */}
        {state === "completed" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            <div className="rounded-card border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
              ✅ 참여 신청이 완료되었습니다!
            </div>
            <p className="text-gray-800">
              안녕하세요, <span className="font-bold">{savedName}</span>님!
            </p>
            <div className="space-y-2">
              <Label htmlFor="edit-memo">메모 수정</Label>
              <Textarea
                id="edit-memo"
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSaveMemo}
              disabled={isSavingMemo}
            >
              {isSavingMemo ? "저장 중..." : "메모 저장"}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? "취소 중..." : "참여 취소"}
            </Button>
          </div>
        )}

        {/* State 3: 취소 완료 상태 */}
        {state === "cancelled" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            <div className="rounded-card border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              참여가 취소되었습니다.
            </div>
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
              onClick={() => {
                localStorage.removeItem(guestTokenKey(shareToken));
                setGuestToken(null);
                setName("");
                setMemo("");
                setState("form");
              }}
            >
              다시 참여하기
            </Button>
          </div>
        )}

        {/* State 4: 정원 초과 안내 */}
        {state === "full" && (
          <div className="rounded-card space-y-2 border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-800">
              😅 이 이벤트는 정원이 가득 찼어요.
            </p>
            <p className="text-sm text-gray-500">
              아쉽지만 더 이상 참여하기 어렵습니다.
            </p>
          </div>
        )}
      </div>

      {/* 모바일 하단 네비게이션 */}
      <BottomNavInline />
    </main>
  );
}
