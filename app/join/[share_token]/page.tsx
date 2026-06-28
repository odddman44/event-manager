"use client";

import { useState } from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full";

// 더미 이벤트 데이터
const EVENT = {
  title: "팀 워크숍",
  date: "2026-07-05T14:00",
  location: "서울 강남구 COEX",
  max: 20,
  registered: 12,
};

// 날짜 포맷 변환 헬퍼
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 이벤트 정보 카드 (모든 상태에서 공통 표시)
function EventInfoCard() {
  return (
    <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">{EVENT.title}</h1>
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-brand size-4 shrink-0" />
          <span>{formatDate(EVENT.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="text-brand size-4 shrink-0" />
          <span>{EVENT.location}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="text-brand size-4 shrink-0" />
          <span>
            {EVENT.registered} / {EVENT.max}명
          </span>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  const [state, setState] = useState<PageState>("form");

  // 신규 참여 폼 입력값
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  // 완료 상태에서 저장된 참여자 이름
  const [savedName, setSavedName] = useState("홍길동");
  const [editMemo, setEditMemo] = useState("잘 부탁드립니다!");

  // 참여하기 버튼 클릭 → 완료 상태로 전환
  const handleJoin = () => {
    setSavedName(name || "홍길동");
    setEditMemo(memo);
    setState("completed");
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-6">
      <div className="w-full max-w-sm space-y-4">
        {/* 공통: 이벤트 정보 카드 */}
        <EventInfoCard />

        {/* State 1: 신규 참여 폼 */}
        {state === "form" && (
          <div className="rounded-card space-y-4 border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800">참여 신청</h2>
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-brand">*</span>
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
            <Button
              className="bg-brand hover:bg-brand/90 w-full text-white"
              onClick={handleJoin}
            >
              참여하기
            </Button>
          </div>
        )}

        {/* State 2: 재방문 / 참여 완료 상태 */}
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
            <Button variant="outline" className="w-full">
              메모 저장
            </Button>
            <Button
              variant="ghost"
              className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => setState("cancelled")}
            >
              참여 취소
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
              className="bg-brand hover:bg-brand/90 w-full text-white"
              onClick={() => {
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

        {/* 개발 편의: 상태 전환 토글 */}
        <div className="rounded-card border border-dashed border-gray-300 p-3">
          <p className="mb-2 text-center text-xs text-gray-400">
            개발용 상태 전환
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["form", "신규 폼"],
                ["completed", "완료"],
                ["cancelled", "취소됨"],
                ["full", "정원 초과"],
              ] as [PageState, string][]
            ).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setState(s)}
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  state === s
                    ? "bg-brand border-brand text-white"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
