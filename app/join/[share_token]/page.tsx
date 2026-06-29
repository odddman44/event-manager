"use client";

import { useState, Suspense } from "react";
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

// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full";

// 더미 이벤트 데이터 (커버 이미지 + 주최자 아바타 포함)
const EVENT = {
  title: "2025 개발자 네트워킹 밤",
  coverImage: "https://picsum.photos/seed/developer/400/200",
  description:
    "서울의 개발자들이 모여 네트워킹하고 경험을 공유하는 자리입니다. 다양한 분야의 개발자들을 만나보세요!",
  event_date: "2025-10-21T15:36:00",
  location: "강남구 테헤란로 152, 강남파이낸스센터",
  current_participants: 8,
  max_participants: 30,
  organizer: {
    name: "김민준",
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=minjun",
  },
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
    <div className="rounded-card overflow-hidden border border-gray-100 bg-white shadow-sm">
      {/* 커버 이미지 */}
      <img
        src={EVENT.coverImage}
        alt={EVENT.title}
        className="h-40 w-full object-cover"
      />

      <div className="space-y-3 p-4">
        <h1 className="text-xl font-bold text-gray-900">{EVENT.title}</h1>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary size-4 shrink-0" />
            <span>{formatDate(EVENT.event_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-primary size-4 shrink-0" />
            <span>{EVENT.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="text-primary size-4 shrink-0" />
            <span>
              {EVENT.current_participants} / {EVENT.max_participants}명
            </span>
          </div>
        </div>

        {/* 주최자 정보 */}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-1">
          <img
            src={EVENT.organizer.avatar}
            alt={EVENT.organizer.name}
            className="h-8 w-8 rounded-full object-cover"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">
              {EVENT.organizer.name}
            </p>
            <p className="text-xs text-gray-500">호스트</p>
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
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-6 pb-20">
      <div className="w-full max-w-sm space-y-4">
        {/* 공통: 이벤트 정보 카드 */}
        <EventInfoCard />

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
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
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
              className="bg-primary hover:bg-primary/90 w-full text-white"
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
      </div>

      {/* 모바일 하단 네비게이션 */}
      <Suspense fallback={null}>
        <BottomNavInline />
      </Suspense>
    </main>
  );
}
