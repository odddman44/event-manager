"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, CalendarDays, MapPin, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  joinEventAction,
  getParticipantByGuestTokenAction,
  getEventParticipantsAction,
  updateParticipantMemoAction,
  cancelParticipationAction,
  reactivateParticipationAction,
} from "@/src/controllers/participant-controller";
import type {
  Event,
  ParticipantRosterEntry,
  ParticipantStatus,
} from "@/src/types";

// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full" | "choice";

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
      <div className="relative h-40 w-full bg-gray-100">
        <Image
          src={event.cover_image_url ?? "/images/default-event-cover.svg"}
          alt={event.title}
          fill
          className="object-cover"
        />
      </div>
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
        {event.description && (
          <p className="text-sm whitespace-pre-wrap text-gray-600">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}

// 회원은 프로필 사진이 있으면 그걸, 없으면(비회원 포함) 기본 아이콘을 보여준다.
// 새 이미지 에셋 없이 기존에 쓰는 lucide 아이콘 패턴을 그대로 따른다.
function ParticipantAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-gray-100">
        <Image src={avatarUrl} alt="" fill className="object-cover" />
      </div>
    );
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
      <User className="size-4 text-gray-400" />
    </div>
  );
}

interface JoinFormProps {
  shareToken: string;
  event: Event;
  registeredCount: number;
  isFull: boolean;
  existingParticipant: {
    guestToken: string;
    name: string;
    memo: string | null;
    status: ParticipantStatus;
  } | null;
  isLoggedIn: boolean;
  loggedInName: string;
}

export default function JoinForm({
  shareToken,
  event,
  registeredCount,
  isFull,
  existingParticipant,
  isLoggedIn,
  loggedInName,
}: JoinFormProps) {
  const router = useRouter();
  const [state, setState] = useState<PageState>(() => {
    if (existingParticipant) {
      return existingParticipant.status === "cancelled"
        ? "cancelled"
        : "completed";
    }
    if (isFull) {
      return "full";
    }
    return isLoggedIn ? "form" : "choice";
  });
  const [guestToken, setGuestToken] = useState<string | null>(
    existingParticipant?.guestToken ?? null,
  );
  // 참여/취소 후 서버가 돌려준 최신 인원수로 갱신 (초기값은 서버 렌더 시점 값)
  const [count, setCount] = useState(registeredCount);
  // 완료 문구는 방금 신청/재참여한 경우에만 노출 (재방문 시에는 부적절)
  const [justJoined, setJustJoined] = useState(false);

  // 신규 참여 폼 입력값
  // 로그인 상태면 프로필 이름으로 미리 채운다(비로그인이면 loggedInName이 빈 문자열).
  const [name, setName] = useState(loggedInName);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 완료 상태에서 저장된 참여자 이름/메모
  const [savedName, setSavedName] = useState(existingParticipant?.name ?? "");
  const [editMemo, setEditMemo] = useState(existingParticipant?.memo ?? "");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // 함께 참여하는 사람들 명단 (완료 상태에서만 조회)
  const [participants, setParticipants] = useState<ParticipantRosterEntry[]>(
    [],
  );

  // 재방문 인식: 서버가 이미 로그인 사용자의 기존 참여를 찾아 넘겨준 경우 이 기기의
  // localStorage에도 기록해 다음 방문부터는 별도 조회 없이 바로 인식되게 한다.
  // 그렇지 않다면 기존과 동일하게 localStorage의 guest_token으로 조회한다.
  useEffect(() => {
    if (existingParticipant) {
      localStorage.setItem(
        guestTokenKey(shareToken),
        existingParticipant.guestToken,
      );
      return;
    }

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
  }, [shareToken, existingParticipant]);

  // 완료 상태가 되면 함께 참여하는 사람들 명단을 가져온다. 서버 액션이 본인이 실제
  // registered 참여자인지 세션/guestToken으로 검증하므로, 참여하지 않은 사람에게는
  // 이 요청 자체가 성공하지 않는다(빈 배열 유지).
  useEffect(() => {
    if (state !== "completed") return;
    getEventParticipantsAction(shareToken, guestToken ?? undefined).then(
      (result) => {
        if (result.success) {
          setParticipants(result.participants);
        }
      },
    );
  }, [state, shareToken, guestToken]);

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
    setCount(result.registeredCount);
    setJustJoined(true);
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
    setCount(result.registeredCount);
    setJustJoined(false);
    setState("cancelled");
  }

  // 취소했던 참여를 되살린다 (guest_token 유지 — 새 레코드를 만들지 않는다)
  async function handleReactivate() {
    if (!guestToken) return;
    setIsSubmitting(true);
    setError(null);
    const result = await reactivateParticipationAction(guestToken);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setCount(result.registeredCount);
    setJustJoined(true);
    setState("completed");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-6 pb-6">
      <div className="w-full max-w-sm space-y-4">
        {/* 공통: 이벤트 정보 카드 */}
        <EventInfoCard event={event} registeredCount={count} />

        {/* State 0: 로그인/비회원 선택 (비로그인 방문자만) */}
        {state === "choice" && (
          <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800">참여 방법 선택</h2>
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
              onClick={() =>
                router.push(
                  `/auth/login?redirect=${encodeURIComponent(`/join/${shareToken}`)}`,
                )
              }
            >
              로그인하고 참여하기
            </Button>
            {event.members_only ? (
              <p className="text-center text-sm text-gray-500">
                이 모임은 회원만 참여할 수 있어요
              </p>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setState("form")}
              >
                비회원으로 계속하기
              </Button>
            )}
          </div>
        )}

        {/* State 1: 신규 참여 폼 */}
        {state === "form" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            {/* 로그인 사용자는 choice 화면을 거치지 않고 바로 이 상태로 들어오므로
                되돌아갈 choice 화면 자체가 없다 — 비회원 방문자에게만 노출한다. */}
            {!isLoggedIn && (
              <button
                type="button"
                onClick={() => setState("choice")}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="size-4" />
                참여 방법 다시 선택
              </button>
            )}
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
            {justJoined && (
              <div className="rounded-card border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                ✅ 참여 신청이 완료되었습니다!
              </div>
            )}
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

        {/* State 2-1: 참여자 명단 (완료 상태에서만, 본인 포함 registered 참여자만) */}
        {state === "completed" && participants.length > 0 && (
          <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800">
              함께 참여하는 사람들
            </h2>
            <ul className="space-y-3">
              {participants.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <ParticipantAvatar avatarUrl={p.avatarUrl} />
                  <span className="flex-1 truncate text-sm text-gray-800">
                    {p.name}
                  </span>
                  {p.isMember ? (
                    <Badge className="shrink-0 border-blue-200 bg-blue-100 text-xs text-blue-700 hover:bg-blue-100">
                      회원
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="shrink-0 border-gray-200 bg-gray-100 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      비회원
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* State 3: 취소 완료 상태 */}
        {state === "cancelled" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            <div className="rounded-card border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              참여가 취소되었습니다.
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
              onClick={handleReactivate}
              disabled={isSubmitting}
            >
              {isSubmitting ? "처리 중..." : "다시 참여하기"}
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
    </main>
  );
}
