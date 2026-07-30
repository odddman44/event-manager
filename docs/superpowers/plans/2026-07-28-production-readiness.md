# 실사용 수준 마무리 (Production Readiness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP 배포 후 남아 있던 14건의 구멍(OAuth 로그인 버튼 누락, 이벤트 삭제 부재, 더미 통계 페이지, 404 링크, 데이터 정합성 오류 등)을 메우고, "내가 참여한 이벤트" 기능을 신설해 실제 사용자에게 내놓을 수 있는 상태로 만든다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 확장한다. 새 테이블은 만들지 않고 `participants`에 `user_id` 컬럼만 추가해 "로그인 사용자의 참여"를 식별한다. 비회원 참여(guest_token + localStorage) 흐름은 서비스의 핵심 가치이므로 그대로 유지하고, 로그인 사용자는 여기에 `user_id`가 추가로 붙는 형태로 공존시킨다. 어드민 통계는 RPC 없이 행을 조회해 JS에서 집계한다(데이터 규모가 작고, 마이그레이션 없이 끝나므로).

**Tech Stack:** Next.js 16 App Router (Server Actions, PPR), Supabase (Postgres + RLS + Storage), react-hook-form + zod, recharts, Tailwind v4, shadcn/ui

**배경 조사:** 2026-07-28 Playwright MCP로 주최자/참여자/어드민 3개 흐름을 전수 검증한 결과를 근거로 작성. 핵심 흐름(로그인, 이벤트 생성/수정, 비회원 참여/취소, 어드민 목록·삭제)은 모두 정상 동작하며, 이 플랜은 그 주변의 결함만 다룬다.

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, 네이밍 camelCase (변수/함수명은 영어).
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `🔥 remove:`, `♻️ refactor:`, `📝 docs:`).
- 날짜/시간 표시는 **반드시** `timeZone: "Asia/Seoul"`을 명시한다. 서버 실행 위치(Vercel UTC)와 무관하게 KST로 고정되어야 한다. 이는 과거에 실제로 터진 버그다(커밋 `dbf7afd`).
- 기존 코드 스타일을 그대로 따른다. 인접 코드를 "개선"하지 않는다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- Server Action에서 `redirect()`는 **반드시 `try/catch` 바깥에서** 호출한다. `redirect()`는 `NEXT_REDIRECT` 에러를 throw하는 방식이라 `catch`에 걸리면 리다이렉트가 삼켜진다. 기존 `createEventAction`이 이 패턴을 지키고 있으니 그대로 따른다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 Playwright MCP로 수행한다. 테스트 계정은 `.env.local`의 `TEST_USER_EMAIL` / `TEST_ADMIN_EMAIL`을 사용한다.
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 것으로 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.

---

## Phase A — 인증 접근성

### Task 1: 일반 로그인/회원가입에 Google OAuth 버튼과 비밀번호 찾기 링크 추가

현재 `GoogleLoginButton` 컴포넌트는 구현되어 있으나 `/admin/login`에서만 사용된다. DB에 Google OAuth로 가입한 실계정이 존재하는데 일반 사용자로 로그인할 방법이 없다. `/auth/forgot-password` 페이지도 구현되어 있으나 어디서도 링크되지 않는다.

**Files:**

- Modify: `components/login-form.tsx`
- Modify: `components/sign-up-form.tsx`

**Interfaces:**

- Consumes: `GoogleLoginButton` (기존, `components/google-login-button.tsx`) — props 없음. 내부에서 `signInWithOAuth({ provider: "google", options: { redirectTo: ${origin}/auth/callback } })`를 호출한다. `/auth/callback`은 이미 role에 따라 `/admin` 또는 `/dashboard`로 분기하므로 추가 작업이 필요 없다.
- Produces: 없음 (UI 변경만)

- [ ] **Step 1: `login-form.tsx`에 import 추가**

`components/login-form.tsx` 상단 import 블록에 다음 한 줄을 추가한다 (`Link` import 아래):

```tsx
import { GoogleLoginButton } from "@/components/google-login-button";
```

- [ ] **Step 2: `login-form.tsx`의 `<CardContent>` 최상단에 OAuth 영역 삽입**

`<CardContent>` 바로 다음, `<form onSubmit={handleLogin}>` 앞에 아래 블록을 삽입한다. `/admin/login`의 구분선 마크업과 동일한 구조를 쓴다:

```tsx
<div className="mb-6 flex flex-col gap-6">
  <GoogleLoginButton />
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="border-border w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-card text-muted-foreground px-2">또는</span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: `login-form.tsx`에 비밀번호 찾기 링크 추가**

비밀번호 `<Label htmlFor="password">비밀번호</Label>`이 들어 있는 `<div className="grid gap-2">` 안에서, Label을 아래 구조로 감싼다:

```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="password">비밀번호</Label>
  <Link
    href="/auth/forgot-password"
    className="text-muted-foreground text-xs underline underline-offset-4"
  >
    비밀번호를 잊으셨나요?
  </Link>
</div>
```

- [ ] **Step 4: `sign-up-form.tsx`에도 동일한 OAuth 영역 추가**

`components/sign-up-form.tsx`에 Step 1의 import를 추가하고, `<CardContent>` 바로 다음 `<form onSubmit={handleSignUp}>` 앞에 Step 2와 **동일한 블록**을 삽입한다 (내용 동일, 복붙):

```tsx
<div className="mb-6 flex flex-col gap-6">
  <GoogleLoginButton />
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="border-border w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-card text-muted-foreground px-2">또는</span>
    </div>
  </div>
</div>
```

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint
```

개발 서버를 띄우고 Playwright MCP로:

1. `http://localhost:3001/auth/login` 접속 → "Continue with Google" 버튼이 보이는지 확인
2. "비밀번호를 잊으셨나요?" 링크 클릭 → `/auth/forgot-password`로 이동하는지 확인
3. `http://localhost:3001/auth/sign-up` 접속 → "Continue with Google" 버튼이 보이는지 확인
4. 기존 이메일/비밀번호 로그인(`test-user@moija.dev` / `TestPassword123!`)이 여전히 `/dashboard`로 가는지 확인

> Google 버튼의 실제 OAuth 리다이렉트는 외부 계정 인증이 필요하므로 자동 검증하지 않는다. 버튼 노출과 클릭 시 Google 동의 화면으로 넘어가는 것까지만 확인하고, 실제 로그인은 사용자가 직접 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add components/login-form.tsx components/sign-up-form.tsx
git commit -m "✨ feat: 일반 로그인/회원가입에 Google OAuth 버튼과 비밀번호 찾기 링크 추가"
```

---

## Phase B — 이벤트 CRUD 완성

### Task 2: 주최자 이벤트 삭제 기능

`deleteEvent`는 repository와 service에 이미 존재하지만 어드민 컨트롤러에서만 쓰인다. 주최자는 자기 이벤트를 삭제할 수 없다. 소유자 검증을 포함한 Server Action과 UI를 추가한다.

**Files:**

- Modify: `src/services/event-service.ts`
- Modify: `src/controllers/event-controller.ts`
- Create: `components/event-delete-button.tsx`
- Modify: `app/events/[id]/page.tsx`

**Interfaces:**

- Consumes: `getEventById(supabase, eventId): Promise<Event | null>`, `deleteEvent(supabase, eventId): Promise<void>` (둘 다 `src/repositories/event-repository.ts`의 기존 함수)
- Produces:
  - `deleteEventByOrganizer(supabase: SupabaseClient<Database>, eventId: string, organizerId: string): Promise<void>` — `src/services/event-service.ts`
  - `deleteEventAction(eventId: string): Promise<{ success: false; error: string } | void>` — `src/controllers/event-controller.ts`. 성공 시 `/dashboard`로 redirect하므로 반환값이 `void`다.
    - **주의:** `src/controllers/admin-controller.ts`에도 동명의 `deleteEventAction`이 이미 있다(어드민용, 소유자 검증 없이 `requireAdmin`으로 검사). 서로 다른 모듈이라 충돌하지 않지만, import할 때 **반드시 `@/src/controllers/event-controller`에서** 가져와야 한다. 어드민 쪽 함수는 수정하지 않는다.
  - `EventDeleteButton` 컴포넌트 — props: `{ eventId: string; eventTitle: string }`

- [ ] **Step 1: service에 소유자 검증 포함 삭제 함수 추가**

`src/services/event-service.ts`의 기존 `deleteEvent` 함수 **아래에** 다음을 추가한다. 기존 `deleteEvent`는 어드민 컨트롤러가 쓰고 있으므로 **삭제하거나 수정하지 않는다**:

```ts
// 주최자 본인이 아니면 에러 (getEventDetail/updateEvent와 동일한 소유자 검증 패턴)
export async function deleteEventByOrganizer(
  supabase: SupabaseClient<Database>,
  eventId: string,
  organizerId: string,
): Promise<void> {
  const event = await getEventByIdRepository(supabase, eventId);
  if (!event || event.organizer_id !== organizerId) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }
  return deleteEventRepository(supabase, eventId);
}
```

`getEventByIdRepository`와 `deleteEventRepository`는 이 파일 상단에서 이미 import 되어 있으므로 import 변경은 없다.

- [ ] **Step 2: controller에 Server Action 추가**

`src/controllers/event-controller.ts`의 import 블록에서 service import에 `deleteEventByOrganizer`를 추가한다:

```ts
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
  deleteEventByOrganizer as deleteEventByOrganizerService,
} from "../services/event-service";
```

파일 맨 아래에 액션을 추가한다. `redirect`가 `try` 바깥에 있는 것에 주의한다:

```ts
export async function deleteEventAction(
  eventId: string,
): Promise<EventActionResult | void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub;
  if (!organizerId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  try {
    await deleteEventByOrganizerService(supabase, eventId, organizerId);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "이벤트 삭제 중 오류가 발생했습니다.",
    };
  }

  redirect("/dashboard");
}
```

- [ ] **Step 3: 삭제 버튼 컴포넌트 생성**

`components/event-delete-button.tsx`를 새로 만든다. 확인 다이얼로그는 기존 `components/admin-delete-button.tsx`와 동일하게 `window.confirm`을 쓴다(프로젝트에 Dialog 컴포넌트가 없고, 어드민이 이미 이 패턴을 쓰고 있어 일관성을 유지):

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteEventAction } from "@/src/controllers/event-controller";

interface EventDeleteButtonProps {
  eventId: string;
  eventTitle: string;
}

export function EventDeleteButton({
  eventId,
  eventTitle,
}: EventDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `"${eventTitle}" 이벤트를 삭제할까요?\n참여자 정보도 함께 삭제되며 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    // 성공 시 액션이 /dashboard로 redirect하므로 이 아래는 실패한 경우에만 실행된다
    const result = await deleteEventAction(eventId);
    setIsDeleting(false);
    if (result && !result.success) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-red-500 hover:bg-red-50 hover:text-red-600"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? "삭제 중..." : "삭제"}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: 이벤트 관리 페이지에 삭제 버튼 배치**

`app/events/[id]/page.tsx`의 import 블록에 추가한다:

```tsx
import { EventDeleteButton } from "@/components/event-delete-button";
```

제목과 수정 버튼이 있는 블록을 찾아서:

```tsx
<div className="mb-4 flex items-start justify-between gap-3">
  <h1 className="text-2xl font-bold">{event.title}</h1>
  <Button asChild variant="outline" size="sm" className="shrink-0">
    <Link href={`/events/${event.id}/edit`}>수정</Link>
  </Button>
</div>
```

다음으로 교체한다:

```tsx
<div className="mb-4 flex items-start justify-between gap-3">
  <h1 className="text-2xl font-bold">{event.title}</h1>
  <div className="flex shrink-0 items-center gap-1">
    <Button asChild variant="outline" size="sm">
      <Link href={`/events/${event.id}/edit`}>수정</Link>
    </Button>
    <EventDeleteButton eventId={event.id} eventTitle={event.title} />
  </div>
</div>
```

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. `test-user@moija.dev`로 로그인 → 이벤트 하나 새로 생성
2. 이벤트 관리 페이지에서 "삭제" 클릭 → confirm 다이얼로그가 뜨는지 확인
   - **주의**: Playwright MCP에서 `window.confirm`은 페이지를 블로킹한다. `browser_handle_dialog` 도구로 accept 처리한다.
3. 삭제 후 `/dashboard`로 이동하고 목록에서 사라졌는지 확인
4. **소유자 검증**: 삭제한 이벤트의 URL을 기억해뒀다가, 다른 계정(`test-admin@moija.dev`)으로 로그인해 다른 사람 이벤트의 `/events/{id}` 접근 시 `/dashboard`로 튕기는지 확인 (기존 `getEventDetail`이 처리하는 부분이지만 회귀 확인)

- [ ] **Step 6: 커밋**

```bash
git add src/services/event-service.ts src/controllers/event-controller.ts components/event-delete-button.tsx "app/events/[id]/page.tsx"
git commit -m "✨ feat: 주최자 이벤트 삭제 기능 추가"
```

---

## Phase C — 표시 누락 및 데이터 정합성

### Task 3: 이벤트 설명(description) 표시

`description`은 폼에서 입력받아 DB에 정상 저장되지만 어느 화면에서도 렌더링되지 않는다. 주최자 관리 페이지와 참여 페이지 양쪽에 노출한다.

**Files:**

- Modify: `app/events/[id]/page.tsx`
- Modify: `components/join-form.tsx`

**Interfaces:**

- Consumes: `Event["description"]: string | null` (기존 타입, `src/types/index.ts`)
- Produces: 없음 (UI 변경만)

- [ ] **Step 1: 이벤트 관리 페이지에 설명 추가**

`app/events/[id]/page.tsx`에서 날짜/장소/정원이 들어 있는 `<div className="text-muted-foreground mb-4 space-y-2 text-sm">` 블록이 **끝나는 지점 바로 다음**에 아래를 삽입한다 (참여 인원 카운터 블록 앞):

<!-- prettier-ignore -->
```tsx
{event.description && (
  <p className="mb-4 text-sm whitespace-pre-wrap">{event.description}</p>
)}
```

> `whitespace-pre-wrap`을 쓰는 이유: textarea로 입력받은 줄바꿈을 그대로 보여주기 위함.

- [ ] **Step 2: 참여 페이지에 설명 추가**

`components/join-form.tsx`의 `EventInfoCard` 컴포넌트에서, 날짜/장소/인원이 들어 있는 `<div className="space-y-2 text-sm text-gray-600">` 블록이 **끝나는 지점 바로 다음**(같은 `<div className="space-y-3 p-4">` 안)에 삽입한다:

<!-- prettier-ignore -->
```tsx
{event.description && (
  <p className="text-sm whitespace-pre-wrap text-gray-600">
    {event.description}
  </p>
)}
```

- [ ] **Step 3: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. 설명을 채워 이벤트 생성 → 관리 페이지에 설명이 보이는지 확인
2. 해당 이벤트의 참여 링크(`/join/{share_token}`) 접속 → 설명이 보이는지 확인
3. 설명 없이 이벤트 생성 → 두 화면 모두 빈 `<p>`가 렌더링되지 않는지 확인(레이아웃 깨짐 없음)

- [ ] **Step 4: 커밋**

```bash
git add "app/events/[id]/page.tsx" components/join-form.tsx
git commit -m "🐛 fix: 저장된 이벤트 설명이 어느 화면에도 표시되지 않던 문제 수정"
```

---

### Task 4: 참여 취소 후 재참여 시 레코드 중복 제거

현재 "다시 참여하기"는 localStorage의 guest_token을 지우고 새 참여 레코드를 만든다. 취소된 레코드가 그대로 남아 주최자 화면에 "취소" 항목이 계속 쌓인다. 기존 레코드를 되살리는 방식으로 바꾼다.

**Files:**

- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`
- Modify: `src/controllers/participant-controller.ts`

**Interfaces:**

- Consumes: `getParticipantByGuestToken`, `countRegisteredParticipants` (기존 participant-repository), `getEventById` (기존 event-repository)
- Produces:
  - `reactivateParticipation(guestToken: string): Promise<Participant>` — repository
  - `reactivateParticipation(supabase: SupabaseClient<Database>, guestToken: string): Promise<Participant>` — service (정원 재검증 포함)
  - `reactivateParticipationAction(guestToken: string): Promise<{ success: true } | { success: false; error: string }>` — controller. Task 6에서 이 시그니처가 `registeredCount`를 포함하도록 확장되므로, Task 6을 함께 읽고 진행하면 재작업을 줄일 수 있다.

- [ ] **Step 1: repository에 재활성화 함수 추가**

`src/repositories/participant-repository.ts` 맨 아래에 추가한다. 기존 `cancelParticipation`과 동일하게 service_role 클라이언트를 쓴다(participants UPDATE는 RLS에서 anon/authenticated를 차단해뒀기 때문):

```ts
export async function reactivateParticipation(
  guestToken: string,
): Promise<Participant> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .update({ status: "registered" })
    .eq("guest_token", guestToken)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "재참여에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 2: service에 정원 재검증 포함 재활성화 추가**

`src/services/participant-service.ts`의 import 블록을 수정한다. event-repository import에 `getEventById`를 추가하고:

```ts
import {
  getEventByShareToken as getEventByShareTokenRepository,
  getEventById as getEventByIdRepository,
} from "../repositories/event-repository";
```

participant-repository import 목록에 `reactivateParticipation`을 추가한다:

```ts
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  createParticipant as createParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
  reactivateParticipation as reactivateParticipationRepository,
} from "../repositories/participant-repository";
```

파일 맨 아래에 함수를 추가한다:

```ts
// 취소했던 참여를 되살린다. 새 레코드를 만들면 주최자 목록에 취소 이력이 중복으로 쌓이므로
// 기존 row의 status만 되돌리고 guest_token은 그대로 유지한다.
export async function reactivateParticipation(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant> {
  const participant = await getParticipantByGuestTokenRepository(
    supabase,
    guestToken,
  );
  if (!participant) {
    throw new Error("참여 정보를 찾을 수 없습니다.");
  }

  const event = await getEventByIdRepository(supabase, participant.event_id);
  if (!event) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }

  if (event.max_participants !== null) {
    const registeredCount = await countRegisteredParticipantsRepository(
      supabase,
      event.id,
    );
    if (registeredCount >= event.max_participants) {
      throw new Error("이 이벤트는 정원이 가득 찼습니다.");
    }
  }

  return reactivateParticipationRepository(guestToken);
}
```

- [ ] **Step 3: controller에 액션 추가**

`src/controllers/participant-controller.ts`의 service import 목록에 추가한다:

```ts
import {
  joinEvent as joinEventService,
  getParticipantByGuestToken as getParticipantByGuestTokenService,
  updateParticipantMemo as updateParticipantMemoService,
  cancelParticipation as cancelParticipationService,
  reactivateParticipation as reactivateParticipationService,
} from "../services/participant-service";
```

파일 맨 아래에 추가한다:

```ts
export async function reactivateParticipationAction(
  guestToken: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await reactivateParticipationService(supabase, guestToken);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "재참여에 실패했습니다.",
    };
  }
}
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm run lint
```

이 Task는 UI 연결(Task 6)이 끝나야 화면에서 확인할 수 있다. 여기서는 타입 통과만 확인하고 커밋한다.

- [ ] **Step 5: 커밋**

```bash
git add src/repositories/participant-repository.ts src/services/participant-service.ts src/controllers/participant-controller.ts
git commit -m "✨ feat: 취소한 참여를 새 레코드 없이 되살리는 재참여 로직 추가"
```

---

### Task 5: 참여 액션이 최신 참여자 수를 반환하도록 확장

참여 페이지의 인원 카운터가 참여/취소 후에도 갱신되지 않는다(`registeredCount`가 서버 렌더 시점 prop으로 고정). 각 액션이 처리 후의 최신 카운트를 반환하게 만들어, UI가 이를 반영할 수 있게 한다.

**Files:**

- Modify: `src/services/participant-service.ts`
- Modify: `src/controllers/participant-controller.ts`

**Interfaces:**

- Consumes: Task 4에서 만든 `reactivateParticipation` service
- Produces (액션 반환 타입 변경 — Task 6이 이 시그니처에 의존한다):
  - `joinEventAction(shareToken, input): Promise<{ success: true; guestToken: string; name: string; registeredCount: number } | { success: false; error: string }>`
  - `cancelParticipationAction(guestToken): Promise<{ success: true; registeredCount: number } | { success: false; error: string }>`
  - `reactivateParticipationAction(guestToken): Promise<{ success: true; registeredCount: number } | { success: false; error: string }>`
  - `updateParticipantMemoAction`은 인원수에 영향이 없으므로 기존 `ActionResult`를 유지한다.

- [ ] **Step 1: service에 "이벤트 ID로 현재 등록 인원 조회" 헬퍼 추가**

`src/services/participant-service.ts` 맨 아래에 추가한다:

```ts
export async function countRegisteredByEventId(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  return countRegisteredParticipantsRepository(supabase, eventId);
}
```

- [ ] **Step 2: controller의 `joinEventAction`이 카운트를 함께 반환하도록 수정**

`src/controllers/participant-controller.ts`의 service import 목록에 `countRegisteredByEventId`를 추가한다:

```ts
import {
  joinEvent as joinEventService,
  getParticipantByGuestToken as getParticipantByGuestTokenService,
  updateParticipantMemo as updateParticipantMemoService,
  cancelParticipation as cancelParticipationService,
  reactivateParticipation as reactivateParticipationService,
  countRegisteredByEventId as countRegisteredByEventIdService,
} from "../services/participant-service";
```

`JoinEventResult` 타입을 수정한다:

```ts
type JoinEventResult =
  | {
      success: true;
      guestToken: string;
      name: string;
      registeredCount: number;
    }
  | { success: false; error: string };
```

`joinEventAction`의 `try` 블록 내부를 다음으로 교체한다:

```ts
  try {
    const participant = await joinEventService(
      supabase,
      shareToken,
      parsed.data,
    );
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return {
      success: true,
      guestToken: participant.guest_token,
      name: participant.name,
      registeredCount,
    };
  } catch (err) {
```

- [ ] **Step 3: 취소/재참여 액션도 카운트를 반환하도록 수정**

같은 파일에서 카운트를 포함하는 결과 타입을 `ActionResult` 정의 아래에 추가한다:

```ts
type CountedActionResult =
  | { success: true; registeredCount: number }
  | { success: false; error: string };
```

`cancelParticipationAction`을 다음으로 교체한다:

```ts
export async function cancelParticipationAction(
  guestToken: string,
): Promise<CountedActionResult> {
  const supabase = await createClient();
  try {
    const participant = await cancelParticipationService(guestToken);
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return { success: true, registeredCount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "참여 취소에 실패했습니다.",
    };
  }
}
```

Task 4에서 만든 `reactivateParticipationAction`도 교체한다:

```ts
export async function reactivateParticipationAction(
  guestToken: string,
): Promise<CountedActionResult> {
  const supabase = await createClient();
  try {
    const participant = await reactivateParticipationService(
      supabase,
      guestToken,
    );
    const registeredCount = await countRegisteredByEventIdService(
      supabase,
      participant.event_id,
    );
    return { success: true, registeredCount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "재참여에 실패했습니다.",
    };
  }
}
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck
```

이 시점에서 `components/join-form.tsx`가 아직 이전 반환 타입을 기대하므로 **타입 에러는 나지 않지만**(추가 필드는 구조적 타이핑상 문제없음) 화면 동작은 Task 6에서 완성된다. 타입체크가 통과하는지만 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/services/participant-service.ts src/controllers/participant-controller.ts
git commit -m "✨ feat: 참여/취소/재참여 액션이 최신 등록 인원수를 함께 반환하도록 확장"
```

---

### Task 6: 참여 페이지 UI — 카운터 실시간 반영, 재방문 문구, 재참여 연결, 네비게이션 정리

한 파일(`join-form.tsx`)에 몰려 있는 4개 문제를 한 번에 정리한다:

1. 참여/취소해도 인원 카운터가 그대로 (Task 5의 반환값으로 해결)
2. 재방문 시 "✅ 참여 신청이 완료되었습니다!"가 계속 표시됨 → 방금 신청한 경우에만 표시
3. "다시 참여하기"가 새 레코드를 만듦 → Task 4의 재활성화 액션 연결
4. 비회원 참여 페이지 하단에 로그인 필요한 메뉴(이벤트/새 이벤트)와 404 링크(프로필)가 노출됨 → 제거

**Files:**

- Modify: `components/join-form.tsx`

**Interfaces:**

- Consumes: Task 5의 `joinEventAction`(`registeredCount` 포함), `cancelParticipationAction`(`registeredCount` 포함), Task 4+5의 `reactivateParticipationAction`(`registeredCount` 포함), 기존 `getParticipantByGuestTokenAction`, `updateParticipantMemoAction`
- Produces: 없음 (UI 변경만)

- [ ] **Step 1: 사용하지 않게 될 import 제거**

`components/join-form.tsx` 상단에서 하단 네비게이션 전용 import를 제거한다. 아래 항목들을 지운다:

- `lucide-react` import에서 `Home`, `Calendar`, `PlusCircle`, `User` (남기는 것: `CalendarDays`, `MapPin`, `Users`)
- `import Link from "next/link";` 전체
- `import { usePathname } from "next/navigation";` 전체

- [ ] **Step 2: `navItems` 상수와 `BottomNavInline` 컴포넌트 삭제**

`const navItems = [...]` 배열과 `function BottomNavInline() {...}` 함수를 통째로 삭제한다. 참여 페이지는 비로그인 방문자용이라 로그인이 필요한 메뉴를 띄우면 안 된다.

- [ ] **Step 3: `reactivateParticipationAction` import 추가**

컨트롤러 import 목록에 추가한다:

```tsx
import {
  joinEventAction,
  getParticipantByGuestTokenAction,
  updateParticipantMemoAction,
  cancelParticipationAction,
  reactivateParticipationAction,
} from "@/src/controllers/participant-controller";
```

- [ ] **Step 4: 카운터와 "방금 참여함" 상태 추가**

`JoinForm` 컴포넌트의 상태 선언부에서 `const [state, setState] = useState<PageState>(...)` 아래에 두 줄을 추가한다:

```tsx
// 참여/취소 후 서버가 돌려준 최신 인원수로 갱신 (초기값은 서버 렌더 시점 값)
const [count, setCount] = useState(registeredCount);
// 완료 문구는 방금 신청/재참여한 경우에만 노출 (재방문 시에는 부적절)
const [justJoined, setJustJoined] = useState(false);
```

- [ ] **Step 5: `EventInfoCard`에 넘기는 값을 state로 교체**

```tsx
<EventInfoCard event={event} registeredCount={registeredCount} />
```

를 다음으로 교체한다:

```tsx
<EventInfoCard event={event} registeredCount={count} />
```

- [ ] **Step 6: `handleJoin`이 카운트와 justJoined를 갱신하도록 수정**

`handleJoin` 함수의 성공 처리 부분을 다음으로 교체한다:

```tsx
localStorage.setItem(guestTokenKey(shareToken), result.guestToken);
setGuestToken(result.guestToken);
setSavedName(result.name);
setEditMemo(memo);
setCount(result.registeredCount);
setJustJoined(true);
setState("completed");
```

- [ ] **Step 7: `handleCancel`이 카운트를 갱신하도록 수정**

`handleCancel` 함수의 성공 처리 부분(`setState("cancelled");` 직전)에 추가한다:

```tsx
setCount(result.registeredCount);
setJustJoined(false);
setState("cancelled");
```

- [ ] **Step 8: 재참여 핸들러 추가**

`handleCancel` 함수 아래에 새 함수를 추가한다:

```tsx
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
```

- [ ] **Step 9: 완료 상태의 문구를 조건부로 변경**

`{state === "completed" && (` 블록 안에서 다음 부분을:

```tsx
<div className="rounded-card border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
  ✅ 참여 신청이 완료되었습니다!
</div>
```

다음으로 교체한다:

<!-- prettier-ignore -->
```tsx
{justJoined && (
  <div className="rounded-card border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
    ✅ 참여 신청이 완료되었습니다!
  </div>
)}
```

- [ ] **Step 10: 취소 상태의 "다시 참여하기" 버튼을 재활성화 액션에 연결**

`{state === "cancelled" && (` 블록의 버튼을 다음으로 교체한다. localStorage를 지우던 기존 동작을 없애는 것이 핵심이다:

<!-- prettier-ignore -->
```tsx
{error && <p className="text-sm text-red-500">{error}</p>}
<Button
  className="bg-primary hover:bg-primary/90 w-full text-white"
  onClick={handleReactivate}
  disabled={isSubmitting}
>
  {isSubmitting ? "처리 중..." : "다시 참여하기"}
</Button>
```

- [ ] **Step 11: 하단 네비게이션 렌더링 제거 및 패딩 조정**

`<main>` 맨 아래의 `<BottomNavInline />` 줄을 삭제한다. 그리고 `<main>`의 className에서 하단 네비 자리를 비워두던 `pb-20`을 `pb-6`으로 바꾼다:

```tsx
<main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-6 pb-6">
```

- [ ] **Step 12: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로 정원 2명짜리 이벤트를 만들어 전체 시나리오를 검증한다:

1. `/join/{share_token}` 접속 → 카운터 `0 / 2명`, 하단 네비게이션이 **없는지** 확인
2. 참여 신청 → "✅ 참여 신청이 완료되었습니다!" 표시 + 카운터가 `1 / 2명`으로 **즉시 갱신**되는지 확인
3. 페이지 새로고침 → 재방문 인식되지만 "✅ 참여 신청이 완료되었습니다!" 문구가 **없는지** 확인, 카운터는 `1 / 2명`
4. "참여 취소" → 카운터가 `0 / 2명`으로 갱신되는지 확인
5. "다시 참여하기" → 카운터 `1 / 2명`, 완료 문구 표시
6. 주최자 화면(`/events/{id}`)에서 참여자 목록에 **김참여가 1건만** 있고 "참여" 상태인지 확인 (취소 레코드가 중복으로 쌓이지 않음)

- [ ] **Step 13: 커밋**

```bash
git add components/join-form.tsx
git commit -m "🐛 fix: 참여 페이지 인원 카운터 미갱신·재방문 문구·재참여 중복·비회원 네비게이션 문제 수정"
```

---

## Phase D — 어드민

### Task 7: 어드민 "총 참여자 수" 집계에서 취소자 제외

어드민 대시보드의 "총 참여자 수"는 `status` 필터 없이 세고 있어 취소한 참여자도 포함된다. 같은 화면의 이벤트 목록은 `registered`만 세므로 두 수치가 어긋난다(실측: 대시보드 "1명" vs 이벤트 목록 "0/3").

**Files:**

- Modify: `src/repositories/admin-repository.ts:26-34`

**Interfaces:**

- Consumes: 없음
- Produces: 없음 (기존 `countParticipants` 시그니처 유지, 동작만 수정)

- [ ] **Step 1: `countParticipants`에 status 필터 추가**

`src/repositories/admin-repository.ts`의 `countParticipants` 함수를 다음으로 교체한다:

```ts
export async function countParticipants(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  // 취소한 참여자는 제외 — 이벤트 목록의 participant_count와 기준을 맞춘다
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("status", "registered");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 2: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. `test-user@moija.dev`로 이벤트 생성 → 참여 링크로 1명 참여 → 참여 취소
2. `test-admin@moija.dev`로 로그인해 `/admin` 접속
3. "총 참여자 수"가 `0명`이고, "최근 이벤트"의 참여 수와 일치하는지 확인
4. 다시 참여시킨 뒤 어드민 새로고침 → 둘 다 1로 올라가는지 확인

- [ ] **Step 3: 커밋**

```bash
git add src/repositories/admin-repository.ts
git commit -m "🐛 fix: 어드민 총 참여자 수가 취소자를 포함해 이벤트 목록과 어긋나던 문제 수정"
```

---

### Task 8: 어드민 통계 분석 페이지 실데이터 연동

`/admin/stats`의 차트 4개가 전부 `components/stats-charts.tsx`에 하드코딩된 더미 데이터다("AI/ML 해커톤 2025 참여자 24명" 등 실재하지 않는 값). 실제 DB 집계로 교체한다.

**Files:**

- Modify: `src/repositories/admin-repository.ts`
- Modify: `src/services/admin-service.ts`
- Modify: `components/stats-charts.tsx`
- Modify: `app/admin/(dashboard)/stats/page.tsx`

**Interfaces:**

- Consumes: `supabase.from("events")`, `supabase.from("profiles")`, `supabase.from("participants")` (어드민은 RLS `is_admin()` 정책으로 전체 조회 가능)
- Produces:
  - `interface TrendPoint { date: string; count: number }` — `src/repositories/admin-repository.ts`에서 export
  - `interface StatusSlice { name: string; value: number }` — 동일 파일에서 export
  - `interface TopEvent { name: string; participants: number }` — 동일 파일에서 export
  - `getEventCreationTrend(supabase, days: number): Promise<TrendPoint[]>`
  - `getUserSignUpTrend(supabase, days: number): Promise<TrendPoint[]>`
  - `getEventStatusDistribution(supabase): Promise<StatusSlice[]>`
  - `getTopEventsByParticipants(supabase, limit: number): Promise<TopEvent[]>`
  - `getStatsData(supabase): Promise<StatsData>` — `src/services/admin-service.ts`. `StatsData`는 `{ eventTrend: TrendPoint[]; userTrend: TrendPoint[]; statusDistribution: StatusSlice[]; topEvents: TopEvent[] }`
  - `StatsCharts` 컴포넌트가 `StatsData` 형태의 props를 받도록 변경

- [ ] **Step 1: repository에 날짜 버킷 헬퍼와 타입 추가**

`src/repositories/admin-repository.ts`의 import 블록 바로 아래에 추가한다:

```ts
export interface TrendPoint {
  date: string;
  count: number;
}

export interface StatusSlice {
  name: string;
  value: number;
}

export interface TopEvent {
  name: string;
  participants: number;
}

// 차트 X축 라벨 (예: "8/15"). 서버 실행 위치와 무관하게 KST 기준으로 고정한다.
function toKstDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

// Postgres 날짜 그룹핑에는 RPC가 필요해, 행을 가져와 JS에서 집계한다 (데이터 규모가 작음).
// 데이터가 없는 날도 0으로 채워 차트에 구멍이 생기지 않게 한다.
function bucketByDay(
  isoDates: string[],
  since: Date,
  days: number,
): TrendPoint[] {
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(since.getDate() + i);
    buckets.set(toKstDayLabel(day), 0);
  }

  for (const iso of isoDates) {
    const label = toKstDayLabel(new Date(iso));
    if (buckets.has(label)) {
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
  }

  return [...buckets].map(([date, count]) => ({ date, count }));
}

function daysAgoStart(days: number): Date {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return since;
}
```

- [ ] **Step 2: repository에 추이 집계 함수 2개 추가**

같은 파일 맨 아래에 추가한다:

```ts
export async function getEventCreationTrend(
  supabase: SupabaseClient<Database>,
  days: number,
): Promise<TrendPoint[]> {
  const since = daysAgoStart(days);
  const { data, error } = await supabase
    .from("events")
    .select("created_at")
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);

  return bucketByDay(
    (data ?? []).map((row) => row.created_at),
    since,
    days,
  );
}

export async function getUserSignUpTrend(
  supabase: SupabaseClient<Database>,
  days: number,
): Promise<TrendPoint[]> {
  const since = daysAgoStart(days);
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);

  return bucketByDay(
    (data ?? []).map((row) => row.created_at),
    since,
    days,
  );
}
```

- [ ] **Step 3: repository에 상태 분포 집계 추가**

같은 파일 맨 아래에 추가한다:

```ts
// events에는 종료 시각이 없어, '진행 중'은 시작 시각이 지났지만 같은 날(KST)인 경우로 정의한다.
export async function getEventStatusDistribution(
  supabase: SupabaseClient<Database>,
): Promise<StatusSlice[]> {
  const { data, error } = await supabase.from("events").select("event_date");
  if (error) throw new Error(error.message);

  const now = new Date();
  const todayLabel = toKstDayLabel(now);

  let upcoming = 0;
  let ongoing = 0;
  let finished = 0;

  for (const row of data ?? []) {
    const eventDate = new Date(row.event_date);
    if (eventDate > now) {
      upcoming += 1;
    } else if (toKstDayLabel(eventDate) === todayLabel) {
      ongoing += 1;
    } else {
      finished += 1;
    }
  }

  return [
    { name: "예정", value: upcoming },
    { name: "진행 중", value: ongoing },
    { name: "종료", value: finished },
  ];
}
```

- [ ] **Step 4: repository에 인기 이벤트 TOP N 집계 추가**

같은 파일 맨 아래에 추가한다:

```ts
export async function getTopEventsByParticipants(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<TopEvent[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title");
  if (error) throw new Error(error.message);
  if (!events || events.length === 0) return [];

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("status", "registered");
  if (participantsError) throw new Error(participantsError.message);

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events
    .map((event) => ({
      name: event.title,
      participants: countByEventId.get(event.id) ?? 0,
    }))
    .sort((a, b) => b.participants - a.participants)
    .slice(0, limit);
}
```

- [ ] **Step 5: service에 통계 조회 함수 추가**

`src/services/admin-service.ts`의 repository import 목록에 추가한다:

```ts
import {
  countEvents as countEventsRepository,
  countUsers as countUsersRepository,
  countParticipants as countParticipantsRepository,
  countUpcomingEvents as countUpcomingEventsRepository,
  listEventsWithOrganizer as listEventsWithOrganizerRepository,
  listRecentUsers as listRecentUsersRepository,
  listUsersWithEventCounts as listUsersWithEventCountsRepository,
  deleteUser as deleteUserRepository,
  getEventCreationTrend as getEventCreationTrendRepository,
  getUserSignUpTrend as getUserSignUpTrendRepository,
  getEventStatusDistribution as getEventStatusDistributionRepository,
  getTopEventsByParticipants as getTopEventsByParticipantsRepository,
  type TrendPoint,
  type StatusSlice,
  type TopEvent,
} from "../repositories/admin-repository";
```

파일 맨 아래에 추가한다:

```ts
export interface StatsData {
  eventTrend: TrendPoint[];
  userTrend: TrendPoint[];
  statusDistribution: StatusSlice[];
  topEvents: TopEvent[];
}

const STATS_TREND_DAYS = 30;
const STATS_TOP_EVENTS_LIMIT = 5;

export async function getStatsData(
  supabase: SupabaseClient<Database>,
): Promise<StatsData> {
  const [eventTrend, userTrend, statusDistribution, topEvents] =
    await Promise.all([
      getEventCreationTrendRepository(supabase, STATS_TREND_DAYS),
      getUserSignUpTrendRepository(supabase, STATS_TREND_DAYS),
      getEventStatusDistributionRepository(supabase),
      getTopEventsByParticipantsRepository(supabase, STATS_TOP_EVENTS_LIMIT),
    ]);

  return { eventTrend, userTrend, statusDistribution, topEvents };
}
```

- [ ] **Step 6: `stats-charts.tsx`의 더미 상수를 props로 교체**

`components/stats-charts.tsx`에서:

1. `eventTrendData`, `userTrendData`, `statusData`, `topEventsData` **네 개의 하드코딩 상수를 모두 삭제**한다.
2. 파일 상단 import에 타입을 추가한다:

```tsx
import type { StatsData } from "@/src/services/admin-service";
```

3. `StatsCharts` 함수 시그니처를 props를 받도록 바꾼다:

```tsx
export function StatsCharts({
  eventTrend,
  userTrend,
  statusDistribution,
  topEvents,
}: StatsData) {
```

4. JSX 안에서 차트에 넘기던 데이터 참조를 교체한다 (줄 번호는 수정 전 기준):
   - 82번 줄 `<LineChart data={eventTrendData}>` → `<LineChart data={eventTrend}>`
   - 146번 줄 `<AreaChart data={userTrendData}>` → `<AreaChart data={userTrend}>`
   - 115번 줄 `data={statusData}` → `data={statusDistribution}`
   - 172번 줄 `data={topEventsData}` → `data={topEvents}`

5. 파이 차트가 삭제된 `statusData`의 `color` 필드를 참조하므로 색상을 상수로 분리한다. 색상은 데이터가 아니라 화면 관심사다. 파일 상단(삭제한 상수 자리)에 추가한다:

```tsx
// 상태 분포 파이차트 색상 (예정 / 진행 중 / 종료 순서 — getEventStatusDistribution의 반환 순서와 일치)
const STATUS_COLORS = ["#111827", "#6b7280", "#d1d5db"];
```

123~125번 줄의 다음 블록을:

```tsx
{
  statusData.map((entry, index) => <Cell key={index} fill={entry.color} />);
}
```

다음으로 교체한다:

<!-- prettier-ignore -->
```tsx
{statusDistribution.map((entry, index) => (
  <Cell key={entry.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
))}
```

- [ ] **Step 7: stats 페이지를 서버 컴포넌트에서 데이터 조회하도록 수정**

`app/admin/(dashboard)/stats/page.tsx` 전체를 다음으로 교체한다. 다른 어드민 페이지와 동일하게 `Suspense`로 감싸 PPR과 맞춘다:

```tsx
import { Suspense } from "react";
import { StatsCharts } from "@/components/stats-charts";
import { createClient } from "@/lib/supabase/server";
import { getStatsData } from "@/src/services/admin-service";

async function StatsContent() {
  const supabase = await createClient();
  const data = await getStatsData(supabase);

  return (
    <StatsCharts
      eventTrend={data.eventTrend}
      userTrend={data.userTrend}
      statusDistribution={data.statusDistribution}
      topEvents={data.topEvents}
    />
  );
}

export default function AdminStatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">통계 분석</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          이벤트와 사용자 데이터를 시각적으로 분석하세요
        </p>
      </div>

      <Suspense>
        <StatsContent />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 8: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. `test-admin@moija.dev`로 로그인 → `/admin/stats` 접속
2. "AI/ML 해커톤 2025", "개발자 네트워킹 밤" 같은 **더미 이벤트명이 더 이상 없는지** 확인
3. "인기 이벤트 TOP 5"에 실제로 만든 이벤트 제목이 나오는지 확인
4. "이벤트 생성 추이" X축 마지막 라벨이 **오늘 날짜(KST)**인지 확인
5. "이벤트 상태 분포"의 세 값 합이 `/admin`의 "총 이벤트" 수와 일치하는지 확인
6. 콘솔 에러가 없는지 확인

- [ ] **Step 9: 커밋**

```bash
git add src/repositories/admin-repository.ts src/services/admin-service.ts components/stats-charts.tsx "app/admin/(dashboard)/stats/page.tsx"
git commit -m "✨ feat: 어드민 통계 분석 페이지를 더미 데이터에서 실데이터 집계로 교체"
```

---

## Phase E — 죽은 링크 및 스타터 잔여물 정리

### Task 9: 프로필 페이지 신설

하단 네비게이션의 "프로필" 탭이 존재하지 않는 `/profile`을 가리켜 404가 난다. 모바일에서 4개 탭 중 1개가 죽어 있는 상태다. 최소 기능(내 정보 확인 + 로그아웃) 페이지를 만든다.

**Files:**

- Create: `app/profile/page.tsx`
- Create: `app/profile/layout.tsx`
- Modify: `proxy.ts:6`

**Interfaces:**

- Consumes: `createClient()` (`lib/supabase/server`), `profiles` 테이블 (`full_name`, `email`, `created_at`, `role`)
- Produces: `/profile` 라우트 (로그인 필수)

- [ ] **Step 1: 미들웨어 보호 경로에 `/profile` 추가**

`proxy.ts` 6번 줄을 다음으로 교체한다:

```ts
const USER_PROTECTED_PREFIXES = ["/dashboard", "/events", "/profile"];
```

- [ ] **Step 2: 프로필 레이아웃 생성**

`app/profile/layout.tsx`를 만든다. `app/dashboard/layout.tsx`와 동일한 셸 구조를 쓴다(헤더 + 하단 네비 + 패딩):

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-primary font-bold">
            모이자
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground hidden md:block"
            >
              내 이벤트
            </Link>
            <ThemeSwitcher />
            <LogoutButton />
          </nav>
        </div>
      </header>
      {/* 모바일에서 하단 네비게이션 높이만큼 패딩 추가 */}
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: 프로필 페이지 생성**

`app/profile/page.tsx`를 만든다:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

// 가입일 포맷: 2026년 7월 28일 (서버 실행 위치와 무관하게 KST 고정)
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function ProfileContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", userId)
    .single();

  if (!profile) {
    redirect("/auth/login");
  }

  return (
    <div className="rounded-card bg-card space-y-4 border p-6 shadow-sm">
      <div>
        <p className="text-muted-foreground text-xs">이름</p>
        <p className="font-medium">{profile.full_name ?? "이름 없음"}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">이메일</p>
        <p className="font-medium">{profile.email}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">가입일</p>
        <p className="font-medium">{formatDate(profile.created_at)}</p>
      </div>
      {profile.role === "admin" && (
        <div>
          <p className="text-muted-foreground text-xs">역할</p>
          <p className="font-medium">관리자</p>
        </div>
      )}
      <div className="border-t pt-4">
        <LogoutButton />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">프로필</h1>
      <Suspense>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. `test-user@moija.dev`로 로그인 → `/profile` 접속 → 이름/이메일/가입일이 표시되는지 확인 (404가 아님)
2. 브라우저 창을 모바일 크기(`browser_resize` 375x812)로 줄이고 `/dashboard`에서 하단 네비 "프로필" 탭 클릭 → `/profile`로 이동하는지 확인
3. 로그아웃 후 `/profile` 직접 접속 → `/auth/login`으로 리다이렉트되는지 확인

- [ ] **Step 5: 커밋**

```bash
git add app/profile proxy.ts
git commit -m "✨ feat: 프로필 페이지 신설 — 하단 네비 프로필 탭 404 해결"
```

---

### Task 10: 스타터 잔여물 제거 및 랜딩 리다이렉트

Supabase 스타터 템플릿에서 온 `/protected` 페이지(JWT claims를 JSON으로 덤프)가 프로덕션 빌드에 포함되어 있다. `/auth/signup`은 `/auth/sign-up`으로 리다이렉트만 하는 중복 라우트다. 그리고 PRD 명세와 달리 로그인 상태로 `/`에 접근해도 대시보드로 보내지 않는다.

**Files:**

- Delete: `app/protected/page.tsx`, `app/protected/layout.tsx`
- Delete: `app/auth/signup/page.tsx`
- Delete: `components/auth-button.tsx`
- Modify: `components/update-password-form.tsx:37`
- Modify: `proxy.ts:5`

**Interfaces:**

- Consumes: 없음
- Produces: 없음 (라우트 제거)

> 사전 확인 결과: `/protected`를 참조하는 곳은 `components/update-password-form.tsx:37`이 유일하고, `components/auth-button.tsx`를 쓰는 곳은 `app/protected/layout.tsx`가 유일하다. `/auth/signup`을 참조하는 코드는 없다. 따라서 아래 삭제는 orphan을 남기지 않는다.

- [ ] **Step 1: 비밀번호 변경 후 이동 경로를 `/dashboard`로 수정**

`components/update-password-form.tsx` 37번 줄을 다음으로 교체한다:

```tsx
router.push("/dashboard");
```

- [ ] **Step 2: 스타터 잔여 파일 삭제**

```bash
rm -rf app/protected app/auth/signup components/auth-button.tsx
```

- [ ] **Step 3: 로그인 상태로 랜딩 접근 시 대시보드로 보내기**

`proxy.ts` 5번 줄을 다음으로 교체한다. `/`를 비로그인 전용 경로로 추가하면, 기존 분기 로직(`isGuestOnly && userId` → role별 리다이렉트)이 그대로 처리한다:

```ts
const GUEST_ONLY_PATHS = ["/", "/auth/login", "/auth/sign-up", "/admin/login"];
```

- [ ] **Step 4: 참조 누락 확인**

```bash
grep -rn "protected\|auth-button\|AuthButton\|/auth/signup" --include='*.tsx' --include='*.ts' app components src lib proxy.ts tests
```

결과가 비어 있어야 한다. 나오면 해당 참조를 정리한 뒤 진행한다.

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint && npm run build
```

빌드 결과 라우트 목록에 `/protected`와 `/auth/signup`이 **더 이상 없어야** 한다.

Playwright MCP로:

1. 비로그인 상태로 `/` 접속 → 랜딩 페이지가 정상 표시되는지 확인
2. `test-user@moija.dev`로 로그인 → `/` 접속 → `/dashboard`로 리다이렉트되는지 확인
3. `test-admin@moija.dev`로 로그인 → `/` 접속 → `/admin`으로 리다이렉트되는지 확인
4. `/protected` 접속 → 404 확인

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "🔥 remove: 스타터 잔여 라우트 제거 및 로그인 상태 랜딩 리다이렉트 추가"
```

---

## Phase F — 내가 참여한 이벤트

> 참조 UI(내 이벤트 = "내가 만든 이벤트" + "내가 참여한 이벤트" 2섹션)를 구현한다. 현재 참여는 완전 비회원 전용(guest_token + localStorage)이라 로그인 사용자의 참여를 계정에 묶을 수단이 없다. `participants.user_id`를 추가해 해결한다.
>
> **설계 판단(합의된 가정):** 비회원 참여 흐름은 그대로 유지한다. 로그인 상태로 참여하면 `guest_token`은 여전히 발급하되 `user_id`가 추가로 채워진다. 즉 로그인 사용자도 기존 코드 경로를 그대로 타고, `user_id`는 "내가 참여한 이벤트" 조회용 색인 역할만 한다. 이렇게 하면 참여/취소/메모수정 로직을 전혀 분기하지 않아도 된다.

### Task 11: `participants.user_id` 컬럼 추가

**Files:**

- Migration: `mcp__supabase__apply_migration` 도구로 적용 (로컬 `supabase/migrations/`에도 자동 기록됨)
- Modify: `lib/supabase/database.types.ts` (타입 재생성으로 덮어씀)
- Modify: `src/types/index.ts`

**Interfaces:**

- Produces: `participants.user_id` 컬럼 (nullable uuid, `auth.users(id)` 참조, `on delete set null`), `Participant["user_id"]: string | null`

- [ ] **Step 1: 마이그레이션 적용**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출한다:

```
name: add_user_id_to_participants
query:
-- 로그인 상태로 참여한 경우 계정과 연결한다. 비회원 참여는 null로 남아 기존 guest_token 흐름을 그대로 유지한다.
alter table public.participants
  add column user_id uuid references auth.users(id) on delete set null;

comment on column public.participants.user_id is '로그인 상태로 참여한 사용자의 ID. 비회원 참여는 null (guest_token으로만 식별)';

-- "내가 참여한 이벤트" 조회용 FK 인덱스
create index if not exists participants_user_id_idx on public.participants(user_id);
```

> RLS는 손대지 않는다. `participants` SELECT 정책이 이미 `using (true)`이고, `events` SELECT도 `using (true)`라 조인 조회에 추가 정책이 필요 없다.

- [ ] **Step 2: TypeScript 타입 재생성**

`mcp__supabase__generate_typescript_types` 도구를 호출하고, 결과를 `lib/supabase/database.types.ts`에 **전체 덮어쓰기**한다.

- [ ] **Step 3: 도메인 타입에 필드 추가**

`src/types/index.ts`의 `Participant` 인터페이스에 `user_id`를 추가한다:

```ts
export interface Participant {
  id: string;
  event_id: string;
  user_id: string | null;
  name: string;
  memo: string | null;
  guest_token: string;
  status: ParticipantStatus;
  created_at: string;
}
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck
```

`mcp__supabase__list_tables` 도구로 `participants` 테이블에 `user_id` 컬럼이 생겼는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations lib/supabase/database.types.ts src/types/index.ts
git commit -m "✨ feat: participants에 user_id 컬럼 추가 — 로그인 사용자 참여 연결용"
```

---

### Task 12: 참여 등록 시 로그인 사용자 연결

**Files:**

- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`
- Modify: `src/controllers/participant-controller.ts`

**Interfaces:**

- Consumes: Task 11의 `participants.user_id`
- Produces:
  - `createParticipant(supabase, eventId, dto, userId?: string | null): Promise<Participant>` — 네 번째 파라미터 추가(선택)
  - `joinEvent(supabase, shareToken, dto, userId?: string | null): Promise<Participant>` — 네 번째 파라미터 추가(선택)
  - `joinEventAction`의 시그니처는 변하지 않는다. 액션 내부에서 세션을 읽어 `userId`를 채운다.

- [ ] **Step 1: repository의 `createParticipant`에 userId 파라미터 추가**

`src/repositories/participant-repository.ts`의 `createParticipant`를 다음으로 교체한다:

```ts
export async function createParticipant(
  supabase: SupabaseClient<Database>,
  eventId: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const { data, error } = await supabase
    .from("participants")
    .insert({
      event_id: eventId,
      name: dto.name,
      memo: dto.memo ?? null,
      user_id: userId ?? null,
      // guest_token은 DB 기본값이 자동 생성
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "참여 신청에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 2: service의 `joinEvent`에 userId 전달**

`src/services/participant-service.ts`의 `joinEvent` 시그니처와 마지막 return을 수정한다:

```ts
export async function joinEvent(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
```

함수 끝의 return을 다음으로 교체한다:

```ts
return createParticipantRepository(
  supabase,
  event.id,
  {
    name: dto.name,
    memo: emptyToUndefined(dto.memo),
  },
  userId,
);
```

- [ ] **Step 3: controller에서 세션 사용자 ID를 읽어 전달**

`src/controllers/participant-controller.ts`의 `joinEventAction`에서 `const supabase = await createClient();` 다음 줄에 추가한다:

```ts
// 로그인 상태면 참여를 계정에 연결한다 (비로그인이면 null — 기존 guest_token 흐름 그대로)
const { data: claims } = await supabase.auth.getClaims();
const userId = claims?.claims?.sub ?? null;
```

`joinEventService` 호출에 인자를 추가한다:

```ts
const participant = await joinEventService(
  supabase,
  shareToken,
  parsed.data,
  userId,
);
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로:

1. `test-user@moija.dev`로 로그인한 상태에서 다른 사람 이벤트의 `/join/{share_token}`에 참여
2. `mcp__supabase__execute_sql`로 확인:
   ```sql
   select name, user_id from participants order by created_at desc limit 3;
   ```
   방금 참여한 행의 `user_id`가 채워져 있어야 한다.
3. 로그아웃 후(또는 시크릿 창) 다시 참여 → 그 행의 `user_id`는 `null`이어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/repositories/participant-repository.ts src/services/participant-service.ts src/controllers/participant-controller.ts
git commit -m "✨ feat: 로그인 상태로 참여 시 계정과 연결"
```

---

### Task 13: 대시보드를 "내가 만든 이벤트" + "내가 참여한 이벤트" 2섹션으로 재구성

**Files:**

- Modify: `src/repositories/event-repository.ts`
- Modify: `src/services/event-service.ts`
- Create: `components/event-card.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**

- Consumes: Task 12에서 채워지는 `participants.user_id`
- Produces:
  - `listEventsByParticipantUserId(supabase, userId): Promise<EventWithParticipantCount[]>` — repository. 본인이 주최한 이벤트는 "내가 만든 이벤트" 섹션과 중복되므로 제외한다.
  - `listParticipatedEvents(supabase, userId): Promise<EventWithParticipantCount[]>` — service
  - `EventCard` 컴포넌트 — props: `{ event: EventWithParticipantCount; href: string }`

- [ ] **Step 1: repository에 참여 이벤트 조회 추가**

`src/repositories/event-repository.ts` 맨 아래에 추가한다:

```ts
// 내가 참여한(등록 상태) 이벤트. 본인이 주최한 이벤트는 "내가 만든 이벤트"와 중복되므로 제외한다.
export async function listEventsByParticipantUserId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EventWithParticipantCount[]> {
  const { data: myParticipations, error: participationError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("user_id", userId)
    .eq("status", "registered");

  if (participationError) {
    throw new Error(participationError.message);
  }

  const eventIds = [
    ...new Set((myParticipations ?? []).map((row) => row.event_id)),
  ];
  if (eventIds.length === 0) {
    return [];
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .in("id", eventIds)
    .neq("organizer_id", userId)
    .order("event_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!events || events.length === 0) {
    return [];
  }

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}
```

- [ ] **Step 2: service에 위임 함수 추가**

`src/services/event-service.ts`의 repository import 목록에 추가한다:

```ts
listEventsByParticipantUserId as listEventsByParticipantUserIdRepository,
```

파일 맨 아래에 추가한다:

```ts
export async function listParticipatedEvents(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EventWithParticipantCount[]> {
  return listEventsByParticipantUserIdRepository(supabase, userId);
}
```

- [ ] **Step 3: 이벤트 카드를 공용 컴포넌트로 분리**

`components/event-card.tsx`를 새로 만든다. 현재 `app/dashboard/page.tsx`에 인라인으로 있는 카드 마크업과 두 헬퍼(`formatDate`, `getStatusBadge`)를 그대로 옮긴 것이다. 두 섹션이 같은 카드를 쓰므로 중복을 피한다:

```tsx
import Link from "next/link";
import Image from "next/image";
import type { EventWithParticipantCount } from "@/src/types";

// 날짜 포맷: 2025년 10월 21일 오후 3:36 (서버 실행 위치와 무관하게 KST 고정)
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// 참여 현황에 따라 뱃지 색상 결정 (정원 없으면 항상 모집 중)
function getStatusBadge(registered: number, max: number | null) {
  if (max === null) {
    return {
      label: "모집 중",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  const ratio = registered / max;
  if (registered >= max) {
    return {
      label: "마감",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (ratio >= 0.8) {
    return {
      label: "거의 마감",
      className: "bg-orange-100 text-orange-700 border-orange-200",
    };
  }
  return {
    label: "모집 중",
    className: "bg-green-100 text-green-700 border-green-200",
  };
}

interface EventCardProps {
  event: EventWithParticipantCount;
  href: string;
}

export function EventCard({ event, href }: EventCardProps) {
  const status = getStatusBadge(
    event.participant_count,
    event.max_participants,
  );

  return (
    <Link
      href={href}
      className="rounded-card bg-card block overflow-hidden border p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative mb-3 h-32 w-full overflow-hidden rounded-md">
        <Image
          src={event.cover_image_url ?? "/images/default-event-cover.svg"}
          alt={event.title}
          fill
          className="object-cover"
        />
      </div>

      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{event.title}</h2>
        <span
          className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="text-muted-foreground space-y-1 text-sm">
        <p>📅 {formatDate(event.event_date)}</p>
        <p>📍 {event.location ?? "장소 미정"}</p>
        <p>
          👥 {event.participant_count}
          {event.max_participants !== null
            ? ` / ${event.max_participants}명`
            : "명 (정원 제한 없음)"}
        </p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: 대시보드를 2섹션 구조로 교체**

`app/dashboard/page.tsx` **전체**를 다음으로 교체한다. 인라인 카드와 헬퍼는 Step 3의 `EventCard`로 옮겼으므로 여기서 사라진다:

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/event-card";
import { createClient } from "@/lib/supabase/server";
import {
  listEventsByOrganizer,
  listParticipatedEvents,
} from "@/src/services/event-service";

async function EventSections() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string;

  const [createdEvents, participatedEvents] = await Promise.all([
    listEventsByOrganizer(supabase, userId),
    listParticipatedEvents(supabase, userId),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-bold">내가 만든 이벤트</h2>
        {createdEvents.length === 0 ? (
          /* 빈 상태 UI */
          <div className="rounded-card flex flex-col items-center justify-center border border-dashed py-16 text-center">
            <p className="mb-2 text-lg font-medium">
              아직 만든 이벤트가 없어요.
            </p>
            <p className="text-muted-foreground mb-6 text-sm">
              첫 이벤트를 만들어보세요!
            </p>
            <Button
              asChild
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Link href="/events/new">이벤트 만들기</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {createdEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                href={`/events/${event.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">내가 참여한 이벤트</h2>
        {participatedEvents.length === 0 ? (
          <div className="rounded-card flex flex-col items-center justify-center border border-dashed py-12 text-center">
            <p className="mb-1 font-medium">참여한 이벤트가 없어요</p>
            <p className="text-muted-foreground text-sm">
              공유받은 링크로 이벤트에 참여해보세요!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {participatedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                href={`/join/${event.share_token}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 이벤트</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            참여하거나 호스팅하는 이벤트를 관리하세요
          </p>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90 text-white">
          <Link href="/events/new">새 이벤트 만들기</Link>
        </Button>
      </div>

      <Suspense>
        <EventSections />
      </Suspense>
    </div>
  );
}
```

> "내가 참여한 이벤트" 카드는 관리 페이지가 아니라 참여 페이지(`/join/{share_token}`)로 보낸다. 참여자는 그 이벤트의 주최자가 아니라 `/events/{id}` 접근 권한이 없기 때문이다.

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint && npm run build
```

Playwright MCP로 두 계정을 오가며 검증한다:

1. `test-admin@moija.dev`로 로그인 → 이벤트 A 생성 → 참여 링크 복사
2. 로그아웃 → `test-user@moija.dev`로 로그인 → 이벤트 B 생성
3. 로그인 상태 그대로 이벤트 A의 참여 링크로 참여
4. `/dashboard` 접속 → "내가 만든 이벤트"에 **B만**, "내가 참여한 이벤트"에 **A만** 보이는지 확인
5. "내가 참여한 이벤트"의 A 카드 클릭 → `/join/{share_token}`으로 이동하고 재방문 상태(메모 수정/참여 취소)로 인식되는지 확인
6. A에서 참여 취소 → `/dashboard` 새로고침 → "내가 참여한 이벤트"에서 사라지는지 확인
7. 참여 이력이 없는 계정에서 "참여한 이벤트가 없어요" 빈 상태가 보이는지 확인

- [ ] **Step 6: 커밋**

```bash
git add src/repositories/event-repository.ts src/services/event-service.ts components/event-card.tsx app/dashboard/page.tsx
git commit -m "✨ feat: 대시보드를 내가 만든/참여한 이벤트 2섹션 구조로 재구성"
```

---

## Phase G — 최종 점검

### Task 14: 전체 회귀 검증 및 문서 갱신

**Files:**

- Modify: `docs/ROADMAP.md`

**Interfaces:**

- Consumes: Task 1~13의 결과 전체
- Produces: 없음

- [ ] **Step 1: 전체 품질 게이트 통과 확인**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

`event-form.tsx:86`의 react-hooks 경고 1건 외에 새 경고가 없어야 한다. `format:check`가 실패하면 `npm run format`으로 정리한다.

- [ ] **Step 2: 기존 E2E 스펙 실행**

```bash
npx playwright test
```

`tests/e2e/app.spec.ts`와 `tests/e2e/auth.spec.ts`가 통과해야 한다. Task 10에서 랜딩 리다이렉트를 추가했으므로 **랜딩 관련 테스트가 깨질 수 있다**. 깨진다면 로그인 상태를 쓰지 않는 테스트인지 확인하고, 비로그인 컨텍스트에서는 여전히 랜딩이 보이는 게 맞으므로 통과해야 정상이다. 실제로 깨지면 원인을 파악해 수정한다(테스트를 지우지 말 것).

- [ ] **Step 3: 3개 사용자 흐름 전체 회귀 검증**

Playwright MCP로 처음부터 끝까지 한 번 훑는다:

- **주최자**: 로그인 → 이벤트 생성(설명·커버 이미지 포함) → 관리 페이지에서 설명/이미지 확인 → 수정 → 공유 링크 복사 → 삭제
- **참여자**: 참여 링크 접속 → 설명 표시 확인 → 참여 → 카운터 갱신 확인 → 새로고침(완료 문구 없음) → 메모 수정 → 취소 → 재참여 → 주최자 화면에서 중복 없음 확인
- **어드민**: 로그인 → 대시보드 수치와 이벤트 목록 참여자 수 일치 확인 → 통계 분석 실데이터 확인 → 이벤트/사용자 목록 및 삭제 확인
- **접근 제어**: 비로그인 `/dashboard` → `/auth/login`, user로 `/admin` → `/dashboard`, 로그인 상태 `/` → 대시보드

- [ ] **Step 4: 테스트 데이터 정리**

검증 과정에서 만든 이벤트/참여자를 정리한다. `mcp__supabase__execute_sql`로 확인 후 삭제한다:

```sql
select id, title, created_at from events order by created_at desc;
```

사용자가 남기길 원하는 데이터가 있는지 확인한 뒤 진행한다. **확인 없이 삭제하지 않는다.**

- [ ] **Step 5: ROADMAP 갱신**

`docs/ROADMAP.md`의 "현재 상태" 섹션을 갱신하고, Phase 8을 추가한다:

```markdown
### Phase 8: 실사용 수준 마무리 ✅

> MVP 배포 후 발견된 결함 14건 수정 및 참여 이벤트 조회 기능 신설
> 상세 계획: `docs/superpowers/plans/2026-07-28-production-readiness.md`

- **Task 017: 인증 접근성 개선** ✅ - 완료
  - [x] 일반 로그인/회원가입에 Google OAuth 버튼 노출
  - [x] 비밀번호 찾기 링크 연결

- **Task 018: 이벤트 CRUD 완성** ✅ - 완료
  - [x] 주최자 이벤트 삭제 기능 (소유자 검증 포함)

- **Task 019: 표시 누락 및 데이터 정합성 수정** ✅ - 완료
  - [x] 이벤트 설명 표시 (관리 페이지 / 참여 페이지)
  - [x] 참여 페이지 인원 카운터 실시간 반영
  - [x] 재방문 시 완료 문구 노출 제거
  - [x] 취소 후 재참여 시 레코드 중복 제거
  - [x] 비회원 참여 페이지의 로그인 전용 네비게이션 제거

- **Task 020: 어드민 정확도 개선** ✅ - 완료
  - [x] 총 참여자 수 집계에서 취소자 제외
  - [x] 통계 분석 페이지 실데이터 연동 (더미 데이터 제거)

- **Task 021: 죽은 링크 및 잔여물 정리** ✅ - 완료
  - [x] 프로필 페이지 신설 (하단 네비 404 해결)
  - [x] 스타터 잔여 라우트(`/protected`, `/auth/signup`) 제거
  - [x] 로그인 상태 랜딩 접근 시 대시보드 리다이렉트

- **Task 022: 내가 참여한 이벤트** ✅ - 완료
  - [x] `participants.user_id` 컬럼 추가 마이그레이션
  - [x] 로그인 상태 참여 시 계정 연결
  - [x] 대시보드 2섹션(내가 만든/참여한) 재구성
```

"현재 상태" 섹션을 다음으로 교체한다:

```markdown
## 현재 상태

- **진행 단계**: 실사용 수준 마무리 완료 — Phase 0~8 전체 완료
- **최종 업데이트**: 2026-07-28
```

- [ ] **Step 6: 커밋**

```bash
git add docs/ROADMAP.md
git commit -m "📝 docs: ROADMAP Phase 8 실사용 수준 마무리 완료 처리"
```

---

## 부록: 이번 스코프에서 의도적으로 제외한 것

계획 수립 중 확인했으나 이번에 다루지 않는 항목이다. 나중에 판단하기 위해 기록해둔다.

- **`app/dashboard/layout.tsx` / `app/events/layout.tsx` / `app/profile/layout.tsx` 3중 중복**: Task 9에서 세 번째 중복이 생긴다. 공용 셸 컴포넌트로 추출할 수 있으나, 이번 플랜의 목적(결함 수정)을 넘는 리팩터링이라 제외했다.
- **커버 이미지 교체 시 기존 Storage 파일 미삭제**: 이전 플랜에서도 스코프 밖으로 뒀던 항목. 파일이 계속 쌓인다.
- **Supabase advisors 잔여 경고**: 정책 중복 평가, `is_admin()` anon 실행 권한, 유출 비밀번호 검사(대시보드 설정 필요). ROADMAP Task 016에서 "낮은 위험도"로 미조치 처리된 상태 그대로 둔다.
- **참여 정원의 동시성**: `joinEvent`가 카운트 확인 후 INSERT하는 구조라, 정원 마지막 1자리에 동시 요청이 몰리면 초과 등록될 수 있다. 소규모 모임 대상 서비스라 실질 위험이 낮아 제외했다. 엄밀히 막으려면 DB 트리거나 트랜잭션 내 잠금이 필요하다.
- **`components/event-form.tsx:86` react-hooks 경고**: react-hook-form의 `watch()`가 React Compiler와 호환되지 않아 발생. 기능상 문제가 없어 baseline으로 둔다.
