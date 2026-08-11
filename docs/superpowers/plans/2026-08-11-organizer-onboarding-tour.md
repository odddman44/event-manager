# 주최자 온보딩 가이드(2단계 툴팁 투어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주최자가 회원가입 직후 대시보드에 처음 진입했을 때, 실제 화면 요소(빈 상태의 "이벤트 만들기" 버튼 → 첫 이벤트 생성 후 상세 페이지의 "링크 복사" 버튼) 위에 붙는 2단계 말풍선 투어로 첫 이벤트 생성과 공유를 안내한다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 유지한다. 온보딩 상태는 `profiles.onboarding_completed_at`(nullable timestamptz) 하나로 관리하고, "이 유저가 만든 이벤트가 0개"(1단계) / "이 이벤트가 이 유저의 첫 이벤트"(2단계)라는 이미 조회 가능한 조건과 조합해 서버 컴포넌트에서 노출 여부를 판단한다. UI는 shadcn `Popover`를 트리거 없이 `open` 상태만 제어하는 공용 `OnboardingCallout` 컴포넌트로 구현하고, ✕(건너뛰기) 또는 감싸인 실제 버튼 클릭 중 어느 쪽이든 온보딩을 영구 완료 처리한다.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + RLS), shadcn/ui(Radix), Playwright MCP(수동 검증)

**참고 문서:**

- 설계 문서(승인됨): `docs/superpowers/specs/2026-08-11-organizer-onboarding-tour-design.md`
- 로드맵: `docs/roadmaps/ROADMAP_v1.md`

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 Playwright MCP로 수행한다. 테스트 계정은 `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`), 비밀번호는 `TEST_USER_PASSWORD`.
- **Playwright MCP 로그인 시 `browser_fill_form`을 쓰지 말 것.** 반드시 `browser_type`을 `#email`, `#password` CSS 셀렉터로 개별 호출한다.
- **`browser_take_screenshot`에 `fullPage: true`를 쓰지 말 것.**
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- DB 마이그레이션은 `mcp__supabase__apply_migration` 도구로 적용한다. **이 도구는 원격 프로젝트에만 적용하고 로컬 `supabase/migrations/` 파일을 만들어주지 않는다.** 적용 후 `mcp__supabase__list_migrations`로 부여된 버전 문자열을 확인하고, `supabase/migrations/<버전>_<이름>.sql` 파일을 같은 내용으로 직접 작성해 커밋한다.
- 이 온보딩 기능은 상시 Playwright E2E 스위트(`tests/e2e/`)에 넣지 않는다 — 회원가입 직후 1회성 상태라 자동화하면 계정/데이터가 계속 쌓인다. 모든 검증은 Playwright MCP 수동 검증으로 수행한다.

---

## Task 1: DB 마이그레이션 — `onboarding_completed_at` 컬럼 추가 및 타입 재생성

> **배경:** `profiles` 테이블에 nullable `onboarding_completed_at timestamptz` 컬럼을 추가한다. 마이그레이션 적용 시점에 이미 존재하는 유저는 전원 `now()`로 백필해서, 배포 직후 기존 유저에게 온보딩이 갑자기 뜨는 일이 없도록 한다. 신규 가입자만 `null`로 시작해 온보딩 대상이 된다.

**Files:**

- Create: `supabase/migrations/<버전>_add_onboarding_completed_at_to_profiles.sql`
- Modify: `lib/supabase/database.types.ts` (재생성)
- Modify: `src/types/index.ts`

**Interfaces:**

- Produces: `profiles.onboarding_completed_at: string | null` (DB 컬럼, `Database["public"]["Tables"]["profiles"]["Row"]`에 반영), `Profile.onboarding_completed_at: string | null` (`src/types/index.ts`)

- [ ] **Step 1: 마이그레이션 적용**

`mcp__supabase__apply_migration` 도구로 아래 SQL을 원격 프로젝트에 적용한다:

```sql
alter table public.profiles add column onboarding_completed_at timestamptz;

-- 배포 시점에 이미 존재하는 유저에게 온보딩이 갑자기 뜨지 않도록 전원 완료 처리한다.
-- 신규 가입자는 이 UPDATE 이후에 만들어지므로 컬럼 기본값(null)을 그대로 받는다.
update public.profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
```

- [ ] **Step 2: 마이그레이션 버전 확인 및 로컬 파일 작성**

`mcp__supabase__list_migrations`로 방금 적용된 마이그레이션의 버전 문자열을 확인한다. `supabase/migrations/<그 버전>_add_onboarding_completed_at_to_profiles.sql` 파일을 만들어 Step 1과 **동일한 SQL 내용**을 그대로 작성한다.

- [ ] **Step 3: TypeScript 타입 재생성**

`mcp__supabase__generate_typescript_types` 도구를 호출해 반환된 전체 내용으로 `lib/supabase/database.types.ts` 파일을 덮어쓴다. `profiles` 테이블의 `Row`/`Insert`/`Update` 각각에 `onboarding_completed_at: string | null`(Row), `onboarding_completed_at?: string | null`(Insert/Update)이 알파벳 순서에 맞게 포함됐는지 확인한다.

- [ ] **Step 4: `Profile` 타입에 필드 추가**

`src/types/index.ts`의 `Profile` interface를:

```ts
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}
```

다음으로 교체한다:

```ts
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  onboarding_completed_at: string | null;
}
```

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: DB 대조 검증**

```sql
select count(*) as null_count from public.profiles where onboarding_completed_at is null;
```

**결과가 0이어야 한다** — 기존 유저 전원이 백필됐는지 확인하는 것.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/ lib/supabase/database.types.ts src/types/index.ts
git commit -m "✨ feat: profiles에 onboarding_completed_at 컬럼 추가 — 기존 유저는 완료 상태로 백필"
```

---

## Task 2: 온보딩 상태 조회/완료 처리 + 첫 이벤트 판별 (Repository → Service → Controller)

> **배경:** 온보딩 노출 여부를 판단하는 데 필요한 두 가지를 데이터 레이어에 추가한다 — (1) 이 유저가 아직 온보딩을 안 봤는지, (2) 주어진 이벤트가 이 유저의 (생성일 기준) 첫 번째 이벤트인지. 둘 다 조회 실패 시 온보딩을 노출하지 않는 쪽(에러를 삼키고 `false`/완료 처리)이 안전하다 — 온보딩은 장식적 기능이라 실패가 본 기능을 막으면 안 된다. 완료 처리(쓰기)는 Server Action으로 노출한다.

**Files:**

- Create: `src/repositories/profile-repository.ts`
- Create: `src/services/profile-service.ts`
- Create: `src/controllers/profile-controller.ts`
- Modify: `src/repositories/event-repository.ts`
- Modify: `src/services/event-service.ts`

**Interfaces:**

- Consumes: Task 1의 `profiles.onboarding_completed_at` 컬럼, 기존 `Database` 타입
- Produces:
  - `getOnboardingCompletedAt(supabase: SupabaseClient<Database>, userId: string): Promise<string | null>` — `src/repositories/profile-repository.ts`
  - `completeOnboarding(supabase: SupabaseClient<Database>, userId: string): Promise<void>` — `src/repositories/profile-repository.ts`
  - `getEarliestEventIdByOrganizer(supabase: SupabaseClient<Database>, organizerId: string): Promise<string | null>` — `src/repositories/event-repository.ts`
  - `isOnboardingPending(supabase: SupabaseClient<Database>, userId: string): Promise<boolean>` — `src/services/profile-service.ts`. 조회 실패 시 `false` 반환(안전한 기본값).
  - `completeOnboarding(supabase: SupabaseClient<Database>, userId: string): Promise<void>` — `src/services/profile-service.ts`
  - `isFirstEventForOrganizer(supabase: SupabaseClient<Database>, organizerId: string, eventId: string): Promise<boolean>` — `src/services/event-service.ts`. 조회 실패 시 `false` 반환.
  - `completeOnboardingAction(): Promise<void>` — `src/controllers/profile-controller.ts`. `"use server"` Server Action, 인자 없음.

- [ ] **Step 1: `profile-repository.ts` 작성**

`src/repositories/profile-repository.ts` 파일을 새로 만든다:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

export async function getOnboardingCompletedAt(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data.onboarding_completed_at;
}

// 온보딩 완료 기록. profiles에는 이미 "Users can update their own profile" UPDATE
// 정책이 있어(20260622094718_fix_profiles_advisor_warnings.sql) 일반 요청 클라이언트로
// 충분하다 — service_role 클라이언트 불필요.
export async function completeOnboarding(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **Step 2: `event-repository.ts`에 `getEarliestEventIdByOrganizer` 추가**

`src/repositories/event-repository.ts`의 `listEventsByOrganizer` 함수 **바로 아래**에 추가한다:

```ts
// 이 주최자가 만든 이벤트 중 가장 먼저 생성된 것의 id. 동시 생성 시 id 오름차순으로
// tie-break해서(Task 1의 countRegisteredBefore와 같은 관례) 결정적으로 만든다.
export async function getEarliestEventIdByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data?.id ?? null;
}
```

- [ ] **Step 3: `profile-service.ts` 작성**

`src/services/profile-service.ts` 파일을 새로 만든다:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import {
  getOnboardingCompletedAt as getOnboardingCompletedAtRepository,
  completeOnboarding as completeOnboardingRepository,
} from "../repositories/profile-repository";

// 온보딩 조회 실패가 페이지 렌더링을 막으면 안 되므로, 에러가 나면 "이미 완료됨"으로
// 처리해 온보딩을 노출하지 않는다 — 장식적 기능이라 fail-safe 쪽이 안전하다.
export async function isOnboardingPending(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  try {
    const completedAt = await getOnboardingCompletedAtRepository(
      supabase,
      userId,
    );
    return completedAt === null;
  } catch {
    return false;
  }
}

export async function completeOnboarding(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await completeOnboardingRepository(supabase, userId);
}
```

- [ ] **Step 4: `event-service.ts`에 `isFirstEventForOrganizer` 추가**

`src/services/event-service.ts`의 event-repository import 블록에 `getEarliestEventIdByOrganizer as getEarliestEventIdByOrganizerRepository`를 추가한다. 기존 import 목록의 형태를 그대로 따르고, 이미 import된 이름을 지우지 않는다.

같은 파일의 `listEventsByOrganizer` 함수 **바로 아래**에 추가한다:

```ts
// 조회 실패 시 온보딩을 노출하지 않는 쪽(false)이 안전하다.
export async function isFirstEventForOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  eventId: string,
): Promise<boolean> {
  try {
    const earliestId = await getEarliestEventIdByOrganizerRepository(
      supabase,
      organizerId,
    );
    return earliestId === eventId;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: `profile-controller.ts` 작성**

`src/controllers/profile-controller.ts` 파일을 새로 만든다:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { completeOnboarding as completeOnboardingService } from "../services/profile-service";

// 온보딩 말풍선은 클라이언트에서 이미 낙관적으로 닫힌 뒤 호출되므로, 이 액션이
// 실패해도 사용자에게 보여줄 에러가 없다. 인증되지 않은 상태로 호출되는 경우는
// 이론상 없지만 방어적으로 조용히 무시한다.
export async function completeOnboardingAction(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return;
  }

  try {
    await completeOnboardingService(supabase, userId);
  } catch {
    // 온보딩 완료 기록 실패는 사용자 경험에 영향 없음 — 조용히 무시
  }
}
```

- [ ] **Step 6: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: 커밋**

```bash
git add src/repositories/profile-repository.ts src/repositories/event-repository.ts src/services/profile-service.ts src/services/event-service.ts src/controllers/profile-controller.ts
git commit -m "✨ feat: 온보딩 상태 조회/완료 처리 및 첫 이벤트 판별 로직 추가"
```

---

## Task 3: `OnboardingCallout` 공용 컴포넌트

> **배경:** 실제 UI 요소를 감싸 그 옆에 항상 열려 있는 안내 말풍선을 붙이는 재사용 컴포넌트. shadcn `Popover`를 트리거 없이 `open` 상태만 제어해서 쓴다. ✕(닫기) 또는 감싸인 실제 요소를 클릭하면 — 둘 중 어느 쪽이든 — `onDismiss`(서버 액션)를 호출하고 즉시 사라진다. 바깥 클릭으로는 안 닫혀서 실수로 놓치지 않는다.

**Files:**

- Create: `components/ui/popover.tsx` (shadcn 생성)
- Create: `components/onboarding/onboarding-callout.tsx`

**Interfaces:**

- Consumes: 없음 (독립적인 공용 UI 컴포넌트)
- Produces:
  - `OnboardingCallout({ message: string; onDismiss: () => Promise<void>; children: React.ReactNode }): JSX.Element` — `components/onboarding/onboarding-callout.tsx`. `onDismiss`에는 Task 2의 `completeOnboardingAction`(Server Action)을 그대로 넘긴다.

- [ ] **Step 1: shadcn Popover 추가**

```bash
npx shadcn@latest add popover
```

`components/ui/popover.tsx`가 생성되고 `package.json`에 `@radix-ui/react-popover`가 추가됐는지 확인한다. 생성된 파일이 `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`를 모두 export하는지 확인한다. **`PopoverAnchor`가 없다면**(shadcn 버전에 따라 빠질 수 있음) 파일 끝에 다음을 추가한다:

```ts
const PopoverAnchor = PopoverPrimitive.Anchor;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
```

(이미 있는 `export` 문과 합치되, 기존 export 목록에서 이름을 지우지 않는다.)

- [ ] **Step 2: `OnboardingCallout` 컴포넌트 작성**

`components/onboarding/onboarding-callout.tsx` 파일을 새로 만든다:

```tsx
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
```

- [ ] **Step 3: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: 커밋**

```bash
git add components/ui/popover.tsx components/onboarding/onboarding-callout.tsx package.json package-lock.json
git commit -m "✨ feat: 온보딩 안내 말풍선 공용 컴포넌트(OnboardingCallout) 추가"
```

---

## Task 4: 대시보드 1단계 — "이벤트 만들기" 버튼에 온보딩 말풍선 연결

> **배경:** `app/dashboard/page.tsx`의 `EventSections`는 이미 `createdEvents.length === 0`을 계산해 빈 상태 UI를 보여주고 있다. 여기에 `isOnboardingPending` 조회를 병렬로 추가해, 두 조건이 모두 참일 때만 빈 상태의 "이벤트 만들기" 버튼을 `OnboardingCallout`으로 감싼다.

**Files:**

- Modify: `app/dashboard/page.tsx`

**Interfaces:**

- Consumes: Task 2의 `isOnboardingPending`(`@/src/services/profile-service`), `completeOnboardingAction`(`@/src/controllers/profile-controller`); Task 3의 `OnboardingCallout`(`@/components/onboarding/onboarding-callout`)
- Produces: 없음 (페이지 컴포넌트)

- [ ] **Step 1: import 추가**

`app/dashboard/page.tsx`의 import 블록을:

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
```

다음으로 교체한다:

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
import { isOnboardingPending } from "@/src/services/profile-service";
import { completeOnboardingAction } from "@/src/controllers/profile-controller";
import { OnboardingCallout } from "@/components/onboarding/onboarding-callout";
```

- [ ] **Step 2: `EventSections`에 온보딩 조건 추가 및 버튼 감싸기**

`app/dashboard/page.tsx`의 `EventSections` 함수 전체를:

```tsx
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
```

다음으로 교체한다:

```tsx
async function EventSections() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string;

  const [createdEvents, participatedEvents, onboardingPending] =
    await Promise.all([
      listEventsByOrganizer(supabase, userId),
      listParticipatedEvents(supabase, userId),
      isOnboardingPending(supabase, userId),
    ]);

  const newEventButton = (
    <Button asChild className="bg-primary hover:bg-primary/90 text-white">
      <Link href="/events/new">이벤트 만들기</Link>
    </Button>
  );

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
            {onboardingPending ? (
              <OnboardingCallout
                message="첫 이벤트를 만들어보세요! 제목과 날짜만 있으면 충분해요."
                onDismiss={completeOnboardingAction}
              >
                {newEventButton}
              </OnboardingCallout>
            ) : (
              newEventButton
            )}
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
```

파일의 나머지 부분(`내가 참여한 이벤트` 섹션 이후)은 그대로 둔다.

- [ ] **Step 3: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: 검증 (Playwright MCP, 포트 3001)**

새 계정으로 회원가입해서 확인한다(기존 테스트 계정은 Task 1에서 백필돼 온보딩 대상이 아니다):

1. 회원가입 → 로그인 상태로 `/dashboard` 진입
2. "아직 만든 이벤트가 없어요" 빈 상태의 "이벤트 만들기" 버튼 위/아래에 말풍선("첫 이벤트를 만들어보세요! 제목과 날짜만 있으면 충분해요.")이 떠 있는지 확인
3. 그 버튼을 클릭 → `/events/new`로 정상 이동하는지 확인(클릭이 막히지 않아야 함 — 핵심 검증 포인트)
4. `test-user@moija.dev`(기존 유저, Task 1에서 백필됨)로 로그인해 `/dashboard` 진입 → 말풍선이 뜨지 않는지 확인(회귀 방지)

- [ ] **Step 5: 커밋**

```bash
git add app/dashboard/page.tsx
git commit -m "✨ feat: 대시보드 빈 상태에 온보딩 1단계 말풍선 연결"
```

---

## Task 5: 이벤트 상세 2단계 — "링크 복사" 버튼에 온보딩 말풍선 연결

> **배경:** `app/events/[id]/page.tsx`의 `EventDetailContent`에 `isOnboardingPending`과 `isFirstEventForOrganizer`를 병렬 조회로 추가해, 두 조건이 모두 참일 때만 `CopyLinkButton`을 `OnboardingCallout`으로 감싼다.

**Files:**

- Modify: `app/events/[id]/page.tsx`

**Interfaces:**

- Consumes: Task 2의 `isOnboardingPending`(`@/src/services/profile-service`), `isFirstEventForOrganizer`(`@/src/services/event-service`), `completeOnboardingAction`(`@/src/controllers/profile-controller`); Task 3의 `OnboardingCallout`(`@/components/onboarding/onboarding-callout`)
- Produces: 없음 (페이지 컴포넌트)

- [ ] **Step 1: import 추가**

`app/events/[id]/page.tsx`의 import 블록을:

```tsx
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import CopyLinkButton from "@/components/copy-link-button";
import { EventDeleteButton } from "@/components/event-delete-button";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/src/services/event-service";
```

다음으로 교체한다:

```tsx
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import CopyLinkButton from "@/components/copy-link-button";
import { EventDeleteButton } from "@/components/event-delete-button";
import { createClient } from "@/lib/supabase/server";
import {
  getEventDetail,
  isFirstEventForOrganizer,
} from "@/src/services/event-service";
import { isOnboardingPending } from "@/src/services/profile-service";
import { completeOnboardingAction } from "@/src/controllers/profile-controller";
import { OnboardingCallout } from "@/components/onboarding/onboarding-callout";
```

- [ ] **Step 2: 온보딩 조건 조회 추가**

`app/events/[id]/page.tsx`의 `EventDetailContent`에서 다음 블록을:

```tsx
const detail = await getEventDetail(supabase, id, organizerId);
if (!detail) {
  redirect("/dashboard");
}
const { event, participants } = detail;
```

다음으로 교체한다:

```tsx
const detail = await getEventDetail(supabase, id, organizerId);
if (!detail) {
  redirect("/dashboard");
}
const { event, participants } = detail;

const [onboardingPending, isFirstEvent] = await Promise.all([
  isOnboardingPending(supabase, organizerId),
  isFirstEventForOrganizer(supabase, organizerId, id),
]);
const showOnboarding = onboardingPending && isFirstEvent;
```

- [ ] **Step 3: `CopyLinkButton`을 조건부로 감싸기**

같은 파일에서 다음 블록을:

```tsx
          <CopyLinkButton link={shareLink} />
        </div>
```

다음으로 교체한다:

```tsx
          {showOnboarding ? (
            <OnboardingCallout
              message="이 링크를 복사해서 참여자들에게 공유해보세요!"
              onDismiss={completeOnboardingAction}
            >
              <CopyLinkButton link={shareLink} />
            </OnboardingCallout>
          ) : (
            <CopyLinkButton link={shareLink} />
          )}
        </div>
```

- [ ] **Step 4: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 5: 검증 (Playwright MCP, 포트 3001)**

Task 4 검증에서 쓴 신규 계정을 이어서 쓴다(이미 온보딩 미완료 상태):

1. Task 4에서 만든 이벤트의 상세 페이지(`/events/{id}`)로 이동
2. "링크 복사" 버튼 옆에 2단계 말풍선("이 링크를 복사해서 참여자들에게 공유해보세요!")이 떠 있는지 확인
3. 그 버튼을 클릭 → 기존 "복사됨!" 텍스트 전환이 정상 동작하는지, 말풍선이 사라지는지 확인
4. `mcp__supabase__execute_sql`로 해당 유저의 `profiles.onboarding_completed_at`이 채워졌는지 확인:
   ```sql
   select onboarding_completed_at from public.profiles where email = '<방금 가입한 이메일>';
   ```
5. 같은 이벤트 상세 페이지를 새로고침 → 말풍선이 다시 뜨지 않는지 확인(완료 상태 유지 — 핵심 검증 포인트)
6. 같은 계정으로 두 번째 이벤트를 하나 더 만들고 그 상세 페이지로 이동 → 말풍선이 뜨지 않는지 확인(첫 번째 이벤트에만 붙는지)

- [ ] **Step 6: 커밋**

```bash
git add "app/events/[id]/page.tsx"
git commit -m "✨ feat: 이벤트 상세 링크 복사 버튼에 온보딩 2단계 말풍선 연결"
```

---

## Task 6: 전체 시나리오 최종 검증 및 로드맵 갱신

**Files:**

- Modify: `docs/roadmaps/ROADMAP_v1.md`

**Interfaces:** Task 1~5 전체 결과를 검증

- [ ] **Step 1: 전체 품질 게이트**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

`components/event-form.tsx:86` 경고 1건 외 새 경고/에러가 없어야 한다.

- [ ] **Step 2: 기존 E2E 스위트 회귀 확인**

```bash
npx playwright test
```

**35/35 전부 통과해야 한다.** (이번 플랜은 `tests/e2e/`를 건드리지 않았으므로 회귀가 있다면 온보딩 통합 코드가 기존 페이지를 깬 것이다.)

- [ ] **Step 3: 건너뛰기(✕) 시나리오 검증 (Playwright MCP, 포트 3001)**

Task 4~5와는 별도로, 새 계정을 하나 더 만들어 확인한다:

1. 회원가입 → `/dashboard` 진입 → 1단계 말풍선의 ✕(건너뛰기) 클릭 → 말풍선이 사라지는지 확인
2. `mcp__supabase__execute_sql`로 해당 유저의 `onboarding_completed_at`이 즉시 채워졌는지 확인
3. 이벤트를 하나 만들고 상세 페이지로 이동 → **2단계 말풍선이 뜨지 않는지 확인** (1단계에서 건너뛰면 전체가 완료 처리되어 2단계도 다시 뜨지 않는다는 설계의 핵심 검증 포인트)

- [ ] **Step 4: 로드맵 갱신**

`docs/roadmaps/ROADMAP_v1.md`의 "현재 상태" 블록을 다음으로 교체한다(날짜는 이 Task를 실제로 완료하는 날짜를 쓴다):

```markdown
- **진행 단계**: 주최자 온보딩 가이드(2단계 툴팁 투어) 완료 — Phase 0~11 전체 완료
- **최종 업데이트**: <오늘 날짜 YYYY-MM-DD>
```

파일 맨 끝(Phase 10 블록 다음)에 다음을 추가한다:

```markdown
### Phase 11: 주최자 온보딩 가이드 ✅

> 회원가입 직후 주최자가 겪는 "무엇부터 해야 하지" 막막함을 줄이기 위해,
> 실제 화면 요소 위에 붙는 2단계 툴팁 투어(이벤트 만들기 → 링크 공유) 추가.
> 설계: `docs/superpowers/specs/2026-08-11-organizer-onboarding-tour-design.md`
> 상세 계획: `docs/superpowers/plans/2026-08-11-organizer-onboarding-tour.md`

- **Task 029: 온보딩 데이터 모델 및 상태 판별 로직** ✅ - 완료
  - [x] `profiles.onboarding_completed_at` 컬럼 추가(기존 유저 백필)
  - [x] 온보딩 대기 여부 / 첫 이벤트 판별 서비스 함수 추가

- **Task 030: 2단계 툴팁 투어 UI 연결** ✅ - 완료
  - [x] 공용 `OnboardingCallout` 컴포넌트(shadcn Popover 기반)
  - [x] 대시보드 "이벤트 만들기" 버튼 + 이벤트 상세 "링크 복사" 버튼에 연결
```

- [ ] **Step 5: 포맷 검증 및 커밋**

```bash
npm run format:check
git add docs/roadmaps/ROADMAP_v1.md
git commit -m "📝 docs: 로드맵 Phase 11(주최자 온보딩 가이드) 완료 처리"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- **어드민/참여자 대상 온보딩** — 이번 투어는 주최자 역할에만 적용된다.
- **이벤트 생성 폼 화면 자체의 단계별 안내** — 폼은 자명하다고 보고 다루지 않는다.
- **온보딩을 다시 보는 기능** — 설정/프로필에서 재실행하는 진입점은 만들지 않는다. 한 번 건너뛰거나 완료하면 영구히 다시 뜨지 않는다.
- **기존에 쌓인 유저 데이터의 소급 온보딩 노출** — Task 1의 백필 UPDATE가 배포 시점 기존 유저를 전원 완료 처리하므로 발생하지 않는다.
