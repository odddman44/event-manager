# `participants` 테이블 RLS 잠금 + admin client 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `participants` 테이블의 INSERT/SELECT RLS 정책을 완전히 제거해서 publishable key로는 이 테이블에 직접 접근할 수 없게 막고, 리포지토리 레이어의 모든 접근을 `createAdminClient()`로 통일한다.

**Architecture:** 코드(리포지토리 전환)를 먼저 끝내고 나서 마이그레이션(정책 제거)을 마지막에 적용하는 순서로 진행한다 — 이렇게 하면 각 단계에서 항상 앱이 정상 동작하는 상태를 유지할 수 있다(코드가 admin client를 써도 되는 정책이 아직 열려있는 동안에는 아무 것도 안 깨지고, 정책을 지울 때는 이미 모든 코드가 admin client라 역시 안 깨진다). 인가(누가 뭘 볼 수 있는지)는 이미 서비스 레이어가 다 하고 있으므로 새로 추가하지 않는다 — 함수 시그니처도 전부 그대로 유지한다(호출부 수정 없음).

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres + Auth), Playwright(자동화 e2e)

**Spec:** `docs/superpowers/specs/2026-08-18-participants-rls-lockdown-design.md`

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- 각 Task는 독립 커밋으로 마무리한다.
- **모든 리포지토리 함수의 시그니처(파라미터/리턴 타입)는 절대 바꾸지 않는다.** `supabase` 파라미터가 함수 내부에서 더 이상 안 쓰이게 되더라도(admin client로 대체됐으므로) 그대로 남겨둔다 — 이 파라미터를 지우면 호출부를 전부 고쳐야 해서 불필요하게 위험이 커진다. (참고: `strict: true`인 `tsconfig.json`에 `noUnusedParameters`는 설정돼 있지 않고, ESLint의 `no-unused-vars`도 뒤에 쓰이는 파라미터가 있으면 기본적으로 안 잡는다 — 실제로 안 잡히는지는 각 Task의 lint 검증으로 확인한다.)
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 `npx playwright test`(자동화 e2e)로 수행한다. `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`)과 `TEST_ADMIN_EMAIL`(`test-admin@moija.dev`) 계정이 Supabase에 존재해야 한다 — 없으면 먼저 만들거나 사람에게 확인한다.
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- **Task 1, 2는 마이그레이션을 적용하지 않는다.** 정책 제거(마이그레이션)는 반드시 Task 3에서, 코드 전환이 전부 끝난 뒤에만 적용한다.

---

## Task 1: `participant-repository.ts` 전환 (6개 함수)

> **배경:** 이 파일은 이미 `updateParticipantMemo`/`cancelParticipation`/`reactivateParticipation`/`hardDeleteParticipant`(UPDATE/DELETE)와 `listRegisteredParticipantsForEvent`의 `profiles` 조회가 admin client를 쓰고 있다. 나머지 6개 함수(1개는 INSERT, 5개는 SELECT)를 같은 패턴으로 전환한다. `createAdminClient`는 이미 이 파일에 import돼 있다.

**Files:**

- Modify: `src/repositories/participant-repository.ts`

**Interfaces:** 없음 — 모든 함수의 시그니처(파라미터/리턴 타입)가 그대로 유지된다. 이 파일을 호출하는 서비스 레이어 코드는 전혀 수정하지 않는다.

- [ ] **Step 1: `countRegisteredParticipants` 전환**

`src/repositories/participant-repository.ts`에서 다음 블록을:

```ts
export async function countRegisteredParticipants(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered");

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}
```

다음으로 교체한다:

```ts
// participants SELECT는 RLS로 막혀있다(비회원도 정원 체크로 호출해야 해서 신원과 무관하게
// 항상 동작해야 함 — RLS로는 "카운트만 허용"을 표현할 수 없다). 인가는 이미 이 함수를 호출하는
// 서비스 레이어에서 처리된다.
export async function countRegisteredParticipants(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<number> {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered");

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}
```

- [ ] **Step 2: `createParticipant` 전환**

다음 블록을:

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
```

다음으로 교체한다:

```ts
// participants INSERT는 RLS로 막혀있다(누구나 임의 이벤트에 참여자를 만들 수 있던 취약점 —
// joinEvent 서비스가 이미 members_only/정원 체크를 마친 뒤 이 함수를 호출한다) admin
// 클라이언트로만 수행한다.
export async function createParticipant(
  supabase: SupabaseClient<Database>,
  eventId: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
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
```

이 함수 안의 `getParticipantByEventAndUser(supabase, eventId, userId)` 호출(동시성 충돌 처리 부분)은 그대로 둔다 — `getParticipantByEventAndUser`가 Step 4에서 내부적으로 admin client를 쓰도록 바뀌므로, 여기서 넘기는 `supabase` 인자는 안 쓰이게 되지만 그래도 문제 없다.

- [ ] **Step 3: `getParticipantByGuestToken` 전환**

다음 블록을:

```ts
export async function getParticipantByGuestToken(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("guest_token", guestToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

다음으로 교체한다:

```ts
// 익명 게스트도 자기 guest_token으로 조회해야 한다 — 여기서는 "신원"이 아니라 "추측 불가능한
// 토큰을 아는가"가 인가 기준이라 RLS로 표현이 안 된다. admin 클라이언트로 조회한다.
export async function getParticipantByGuestToken(
  supabase: SupabaseClient<Database>,
  guestToken: string,
): Promise<Participant | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .select("*")
    .eq("guest_token", guestToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

- [ ] **Step 4: `getParticipantByEventAndUser` 전환**

다음 블록을:

```ts
export async function getParticipantByEventAndUser(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string,
): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

다음으로 교체한다:

```ts
// 호출부가 항상 자기 세션의 userId만 넘긴다(서비스 레이어가 이미 검증). admin 클라이언트로
// 조회한다.
export async function getParticipantByEventAndUser(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string,
): Promise<Participant | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

- [ ] **Step 5: `countRegisteredBefore` 전환**

다음 블록을:

```ts
export async function countRegisteredBefore(
  supabase: SupabaseClient<Database>,
  eventId: string,
  createdAt: string,
  id: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered")
    .or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}
```

다음으로 교체한다:

```ts
// 정원 경쟁 순번 계산 — 비회원도 호출해야 하므로 admin 클라이언트를 쓴다.
export async function countRegisteredBefore(
  supabase: SupabaseClient<Database>,
  eventId: string,
  createdAt: string,
  id: string,
): Promise<number> {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered")
    .or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}
```

- [ ] **Step 6: `listRegisteredParticipantsForEvent`의 `participants` 조회 전환**

다음 블록을(함수 전체):

```ts
// registered 참여자만, 이름/회원여부/아바타만 반환한다(memo, guest_token 등은 절대 포함하지
// 않음 — 다른 참여자에게 노출할 정보가 아니다). participants.user_id는 auth.users(id)를
// 참조하고 profiles를 직접 참조하지 않아 PostgREST 중첩 select로 조인이 안 될 수 있으므로,
// 이 리포지토리의 listEventsWithOrganizer(admin-repository.ts)와 동일하게 두 번 쿼리 후
// Map으로 결합한다.
export async function listRegisteredParticipantsForEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<ParticipantRosterEntry[]> {
  const { data: participants, error } = await supabase
    .from("participants")
    .select("name, user_id")
    .eq("event_id", eventId)
    .eq("status", "registered")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!participants || participants.length === 0) {
    return [];
  }

  const memberIds = [
    ...new Set(
      participants
        .map((p) => p.user_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const avatarByUserId = new Map<string, string | null>();
  if (memberIds.length > 0) {
    // profiles는 본인 행만 조회 가능한 RLS 정책만 있어(다른 참여자 조회 불가) 요청자 클라이언트로는
    // 항상 0~1건만 반환된다. 이 명단을 볼 권한 자체는 상위 서비스 레이어에서 이미 검증했으므로,
    // 다른 회원들의 avatar_url 조회에는 admin 클라이언트로 RLS를 우회한다.
    const adminClient = createAdminClient();
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, avatar_url")
      .in("id", memberIds);
    if (profilesError) {
      throw new Error(profilesError.message);
    }
    for (const profile of profiles ?? []) {
      avatarByUserId.set(profile.id, profile.avatar_url);
    }
  }

  return participants.map((p) => ({
    name: p.name,
    isMember: p.user_id !== null,
    avatarUrl: p.user_id ? (avatarByUserId.get(p.user_id) ?? null) : null,
  }));
}
```

다음으로 교체한다(participants 조회도 admin client로, `adminClient` 선언을 함수 상단으로 옮겨서 두 쿼리가 하나를 공유하도록):

```ts
// registered 참여자만, 이름/회원여부/아바타만 반환한다(memo, guest_token 등은 절대 포함하지
// 않음 — 다른 참여자에게 노출할 정보가 아니다). participants.user_id는 auth.users(id)를
// 참조하고 profiles를 직접 참조하지 않아 PostgREST 중첩 select로 조인이 안 될 수 있으므로,
// 이 리포지토리의 listEventsWithOrganizer(admin-repository.ts)와 동일하게 두 번 쿼리 후
// Map으로 결합한다. participants/profiles 둘 다 RLS가 막혀있어(이 명단을 볼 권한은 상위
// 서비스 레이어에서 이미 검증됨) admin 클라이언트 하나를 두 쿼리에 재사용한다.
export async function listRegisteredParticipantsForEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<ParticipantRosterEntry[]> {
  const adminClient = createAdminClient();
  const { data: participants, error } = await adminClient
    .from("participants")
    .select("name, user_id")
    .eq("event_id", eventId)
    .eq("status", "registered")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!participants || participants.length === 0) {
    return [];
  }

  const memberIds = [
    ...new Set(
      participants
        .map((p) => p.user_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const avatarByUserId = new Map<string, string | null>();
  if (memberIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, avatar_url")
      .in("id", memberIds);
    if (profilesError) {
      throw new Error(profilesError.message);
    }
    for (const profile of profiles ?? []) {
      avatarByUserId.set(profile.id, profile.avatar_url);
    }
  }

  return participants.map((p) => ({
    name: p.name,
    isMember: p.user_id !== null,
    avatarUrl: p.user_id ? (avatarByUserId.get(p.user_id) ?? null) : null,
  }));
}
```

- [ ] **Step 7: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

`supabase` 파라미터가 여러 함수에서 더 이상 안 쓰이게 됐는데, 이게 새 lint 경고/에러로 잡히지 않는지 확인한다(Global Constraints 참고 — 뒤에 쓰이는 파라미터가 있어서 기본 규칙상 안 잡혀야 함).

- [ ] **Step 8: 전체 e2e 스위트로 회귀 확인**

개발 서버(포트 3001)를 띄운 상태에서:

```bash
npx playwright test
```

정책은 아직 열려있는 상태라(Task 3에서 제거) admin client로 바꿔도 동작은 그대로여야 한다 — 전부 통과해야 한다(실패 0건).

- [ ] **Step 9: 커밋**

```bash
git add src/repositories/participant-repository.ts
git commit -m "♻️ refactor: participant-repository의 나머지 participants 접근을 admin client로 전환"
```

---

## Task 2: `event-repository.ts` + `admin-repository.ts` 전환 (6개 함수, 6개 쿼리 지점)

> **배경:** `event-repository.ts`에는 `createAdminClient` import가 아직 없다 — 추가해야 한다. `admin-repository.ts`는 이미 import돼 있다.

**Files:**

- Modify: `src/repositories/event-repository.ts`
- Modify: `src/repositories/admin-repository.ts`

**Interfaces:** 없음 — 모든 함수의 시그니처가 그대로 유지된다.

- [ ] **Step 1: `event-repository.ts`에 `createAdminClient` import 추가**

`src/repositories/event-repository.ts`에서 다음 블록을:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateEventDto,
  UpdateEventDto,
  Event,
  EventWithParticipantCount,
  Participant,
} from "../types";
```

다음으로 교체한다:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateEventDto,
  UpdateEventDto,
  Event,
  EventWithParticipantCount,
  Participant,
} from "../types";
import { createAdminClient } from "../../lib/supabase/admin";
```

- [ ] **Step 2: `listEventsByOrganizer`의 참여자 수 집계 전환**

다음 블록을:

```ts
export async function listEventsByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<EventWithParticipantCount[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
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
```

다음으로 교체한다:

```ts
export async function listEventsByOrganizer(
  supabase: SupabaseClient<Database>,
  organizerId: string,
): Promise<EventWithParticipantCount[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .order("event_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!events || events.length === 0) {
    return [];
  }

  // 이미 이 주최자의 이벤트 id로만 필터링된 뒤의 단순 집계지만, participants SELECT
  // 자체가 RLS로 막혀있어 admin 클라이언트가 필요하다.
  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );
```

- [ ] **Step 3: `listParticipantsByEvent` 전환**

다음 블록을:

```ts
export async function listParticipantsByEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
```

다음으로 교체한다:

```ts
// getEventDetail 서비스가 event.organizer_id === organizerId를 이미 확인한 뒤 호출한다.
export async function listParticipantsByEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Participant[]> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
```

- [ ] **Step 4: `listEventsByParticipantUserId`의 참여자 조회 2곳 전환**

다음 블록을:

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
```

다음으로 교체한다:

```ts
// 내가 참여한(등록 상태) 이벤트. 본인이 주최한 이벤트는 "내가 만든 이벤트"와 중복되므로 제외한다.
// app/dashboard/page.tsx가 자기 세션 userId만 넘긴다(비로그인은 미들웨어가 이미 차단).
export async function listEventsByParticipantUserId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EventWithParticipantCount[]> {
  const adminClient = createAdminClient();
  const { data: myParticipations, error: participationError } =
    await adminClient
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

  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );
```

(두 번째 participants 조회도 위에서 만든 `adminClient`를 재사용한다 — 새로 선언하지 않는다.)

- [ ] **Step 5: `admin-repository.ts`의 `countParticipants` 전환**

`src/repositories/admin-repository.ts`에서 다음 블록을:

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

다음으로 교체한다:

```ts
export async function countParticipants(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  // 취소한 참여자는 제외 — 이벤트 목록의 participant_count와 기준을 맞춘다.
  // admin-controller.ts의 requireAdmin이 상위에서 이미 게이트하지만, participants SELECT
  // 자체가 RLS로 막혀있어 admin 클라이언트가 필요하다.
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("status", "registered");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 6: `listEventsWithOrganizer`의 참여자 수 집계 전환**

다음 블록을:

```ts
  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );
  if (participantsError) throw new Error(participantsError.message);

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    organizer_name: nameByOrganizerId.get(event.organizer_id) ?? "알 수 없음",
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}
```

다음으로 교체한다:

```ts
  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered")
    .in(
      "event_id",
      events.map((event) => event.id),
    );
  if (participantsError) throw new Error(participantsError.message);

  const countByEventId = new Map<string, number>();
  for (const participant of participants ?? []) {
    countByEventId.set(
      participant.event_id,
      (countByEventId.get(participant.event_id) ?? 0) + 1,
    );
  }

  return events.map((event) => ({
    ...event,
    organizer_name: nameByOrganizerId.get(event.organizer_id) ?? "알 수 없음",
    participant_count: countByEventId.get(event.id) ?? 0,
  }));
}
```

- [ ] **Step 7: `getTopEventsByParticipants` 전환**

다음 블록을:

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
```

다음으로 교체한다:

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

  const adminClient = createAdminClient();
  const { data: participants, error: participantsError } = await adminClient
    .from("participants")
    .select("event_id")
    .eq("status", "registered");
  if (participantsError) throw new Error(participantsError.message);
```

- [ ] **Step 8: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 9: 전체 e2e 스위트로 회귀 확인**

```bash
npx playwright test
```

정책은 아직 열려있는 상태다 — 전부 통과해야 한다(실패 0건).

- [ ] **Step 10: 커밋**

```bash
git add src/repositories/event-repository.ts src/repositories/admin-repository.ts
git commit -m "♻️ refactor: event-repository/admin-repository의 participants 접근을 admin client로 전환"
```

---

## Task 3: 마이그레이션 적용 + 보안 회귀 테스트 + 백로그 갱신

> **배경:** Task 1~2로 모든 코드가 admin client를 쓰게 됐으니, 이제 실제로 정책을 지워도 앱이 안 깨진다.

**Files:**

- Create: `supabase/migrations/20260818050000_drop_participants_permissive_policies.sql`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `docs/superpowers/backlog-notes.md`

**Interfaces:** 없음

- [ ] **Step 1: 마이그레이션 작성 및 적용**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출한다:

- `name`: `drop_participants_permissive_policies`
- `query`:

```sql
drop policy "비회원 참여 등록" on public.participants;
drop policy "주최자 참여자 목록 조회" on public.participants;
```

적용 후 `mcp__supabase__list_migrations`로 목록에 나타나는지 확인한다.

- [ ] **Step 2: 정책이 실제로 사라졌는지 SQL로 확인**

`mcp__supabase__execute_sql`로 다음을 실행한다:

```sql
select policyname, cmd from pg_policies where tablename = 'participants';
```

`"비회원 참여 등록"`(INSERT)과 `"주최자 참여자 목록 조회"`(SELECT)가 결과에 없어야 한다. UPDATE 정책은 이미 예전에 제거됐으니 애초에 없고, DELETE 정책도 원래 없다 — 남아있으면 안 되는 게 정상이다.

- [ ] **Step 3: 보안 회귀 e2e 테스트 추가**

`tests/e2e/auth.spec.ts`의 맨 끝에 있는 다음 블록을(마지막 테스트, 파일의 끝):

```ts
  test("일반 사용자가 /admin 접근 시 /dashboard 리다이렉트", async ({
    page,
  }) => {
    // 일반 사용자로 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // /admin 접근 시도
    await page.goto("/admin");
    await expect(page).toHaveURL("/dashboard", { timeout: 5000 });
  });
});
```

다음으로 교체한다(끝에 새 `test.describe` 블록 추가). 이 파일은 현재 `import { test, expect } from "@playwright/test";`만 쓰고 있고, 아래 새 테스트는 Playwright의 내장 `request` fixture만 쓰므로(콜백 파라미터로 바로 받음) import를 추가할 필요가 없다:

```ts
  test("일반 사용자가 /admin 접근 시 /dashboard 리다이렉트", async ({
    page,
  }) => {
    // 일반 사용자로 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // /admin 접근 시도
    await page.goto("/admin");
    await expect(page).toHaveURL("/dashboard", { timeout: 5000 });
  });
});
// ──────────────────────────────────────────────
// participants 테이블 직접 접근 차단 (RLS 보안 회귀)
// ──────────────────────────────────────────────
test.describe("participants 테이블 RLS", () => {
  test("비로그인 상태로 REST에 직접 INSERT/SELECT 요청을 보내도 거부된다", async ({
    request,
  }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    // INSERT 시도: 임의 event_id로 참여자 생성을 시도한다. INSERT 정책이 아예 없으면
    // Postgres RLS가 "new row violates row-level security policy" 에러로 요청 자체를
    // 거부한다(SELECT처럼 빈 배열로 조용히 필터링되는 게 아니라 4xx 에러 응답).
    const insertResponse = await request.post(
      `${supabaseUrl}/rest/v1/participants`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        data: {
          event_id: "00000000-0000-0000-0000-000000000000",
          name: "RLS 우회 시도",
        },
      },
    );
    expect(insertResponse.ok()).toBe(false);

    // SELECT 시도: 참여자를 event_id 조건 없이 직접 조회한다. SELECT 정책이 아예 없으면
    // Postgres RLS가 모든 행을 조용히 필터링한다 — 요청 자체는 200으로 성공하지만
    // 결과가 항상 빈 배열이다(INSERT와 달리 에러가 아님).
    const selectResponse = await request.get(
      `${supabaseUrl}/rest/v1/participants?select=*&limit=1`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
        },
      },
    );
    expect(selectResponse.ok()).toBe(true);
    const selectBody = await selectResponse.json();
    expect(selectBody).toEqual([]);
  });
});
```

- [ ] **Step 4: 신규 테스트 실행 확인**

```bash
npx playwright test tests/e2e/auth.spec.ts -g "participants 테이블"
```

통과해야 한다.

- [ ] **Step 5: 전체 e2e 스위트 최종 회귀 확인**

```bash
npx playwright test
```

전부 통과해야 한다(실패 0건). 이 시점에는 정책이 실제로 제거된 상태에서 돌아가는 것이므로, 여기서 하나라도 실패하면 Task 1~2에서 놓친 접근 지점이 있다는 뜻이다 — 그 실패한 시나리오가 건드리는 리포지토리 함수를 찾아서 admin client로 전환하고(이 Task 안에서 고친다), 다시 전체 스위트를 돌린다.

- [ ] **Step 6: 백로그 문서 갱신**

`docs/superpowers/backlog-notes.md`에서 `#11` 섹션의 제목 줄을 찾아 다음처럼(완료 표시 추가):

```markdown
## #11: `participants` 테이블의 anon INSERT RLS가 서버 액션을 우회할 수 있음
```

다음으로 교체한다:

```markdown
## #11: `participants` 테이블의 anon INSERT RLS가 서버 액션을 우회할 수 있음 ✅ 완료

> 설계: `docs/superpowers/specs/2026-08-18-participants-rls-lockdown-design.md`
> 플랜: `docs/superpowers/plans/2026-08-18-participants-rls-lockdown.md`
```

- [ ] **Step 7: 포맷 검증 및 커밋**

```bash
npm run format:check
git add supabase/migrations/20260818050000_drop_participants_permissive_policies.sql tests/e2e/auth.spec.ts docs/superpowers/backlog-notes.md
git commit -m "🔒 fix: participants 테이블 INSERT/SELECT RLS 잠금 + 보안 회귀 테스트 추가"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- `events` 테이블의 공개 조회 정책 — 의도된 공개 정책이라 그대로 둔다.
- `#7`(암호 보호), `#4`(날짜 범위), `#8`(로그인 시 헤더 노출) — 백로그 노트 참고, 별도 브레인스토밍.
