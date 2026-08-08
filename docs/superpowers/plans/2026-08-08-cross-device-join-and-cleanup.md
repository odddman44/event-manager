# 크로스 디바이스 중복 참여 방지 및 잔여 결함 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 자신의 참여를 두 번째 기기(또는 브라우저)에서 열었을 때 중복 참여 레코드가 생기는 데이터 정합성 문제를 막고, 직전 플랜(`2026-07-28-production-readiness.md`)의 최종 리뷰에서 parked 처리된 Minor findings 8건을 정리한다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 확장한다. 핵심은 "로그인 사용자의 참여는 `(event_id, user_id)` 쌍으로 유일해야 한다"는 불변식을 서비스 로직(먼저 조회 후 재사용/재활성화)과 DB 부분 유니크 인덱스(동시 요청 방어) 양쪽에서 강제하는 것이다. 참여 페이지도 서버에서 이 기존 참여를 미리 조회해, 로그인 사용자가 다른 기기에서 링크를 열었을 때 빈 폼이 아니라 즉시 "이미 참여 중" 상태를 보여주도록 확장한다.

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres + RLS), react-hook-form + zod, recharts, Tailwind v4

**참고 문서:**

- 이전 플랜(완료, 참고용): `docs/superpowers/plans/2026-07-28-production-readiness.md`
- 로드맵: `docs/roadmaps/ROADMAP_v1.md` (직전 세션 종료 시점에 `docs/ROADMAP.md`에서 이 경로로 이름이 바뀌었다 — 워크스페이스에 아직 커밋되지 않은 변경사항이니 그대로 존중하고 이 경로를 사용한다)

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`).
- 날짜/시간 표시는 **반드시** `timeZone: "Asia/Seoul"`을 명시한다. 서버 실행 위치(Vercel는 UTC)와 무관하게 KST로 고정되어야 한다 — 과거 실제로 이 때문에 배포 버그가 났었다(커밋 `dbf7afd`).
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- Server Action에서 `redirect()`는 반드시 `try/catch` 바깥에서 호출한다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 Playwright MCP로 수행한다. 테스트 계정은 `.env.local`의 `TEST_USER_EMAIL` / `TEST_ADMIN_EMAIL`을 사용한다.
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- DB 마이그레이션은 `mcp__supabase__apply_migration` 도구로 적용한다(이 프로젝트는 로컬 supabase 스택이 아니라 연결된 실제 프로젝트를 직접 다룬다). 적용 후 `mcp__supabase__generate_typescript_types`로 타입을 재생성해 `lib/supabase/database.types.ts`에 덮어쓴다.

---

## Phase A — 크로스 디바이스 중복 참여 방지 (핵심)

> **배경:** 현재 참여 페이지(`/join/{share_token}`)는 "이미 참여했는지"를 오직 이 기기의 `localStorage`에 저장된 `guest_token`으로만 판단한다(`components/join-form.tsx`). 로그인한 사용자가 자신의 참여 링크를 다른 기기(예: PC에서 만든 이벤트에 폰으로 참여한 뒤, 나중에 PC에서 같은 링크를 또 열어보는 경우)에서 열면 이 기기는 그 사실을 모르므로 빈 참여 폼이 뜨고, 제출하면 같은 이벤트에 같은 사용자의 참여 레코드가 두 개 생긴다. 참여자 목록에 같은 사람이 중복으로 뜨고, 참여 인원 카운터가 부풀려지고, 정원을 한 자리 더 소모한다. 이 플랜은 `participants.user_id`(로그인 여부를 식별하는 컬럼, 지난 플랜에서 추가됨)를 이용해 "로그인 사용자 + 이벤트" 조합이 항상 최대 1개의 참여 레코드만 갖도록 만든다.

### Task 1: DB에 부분 유니크 인덱스 추가

**Files:**

- Migration: `mcp__supabase__apply_migration` 도구로 적용 (로컬 `supabase/migrations/`에도 자동 기록됨)

**Interfaces:**

- Produces: `participants(event_id, user_id)` 부분 유니크 인덱스 (동시 요청으로 인한 레이스 컨디션에서도 중복 행이 실제로 만들어지는 것을 DB 레벨에서 막는다). Task 2의 `createParticipant`가 이 제약의 위반(Postgres 에러 코드 `23505`)을 감지해 처리한다.

- [ ] **Step 1: 기존 중복 데이터가 있는지 먼저 확인한다 (중요 — 건너뛰지 말 것)**

이 플랜이 고치려는 버그가 이미 실제로 발생했다면, `(event_id, user_id)` 조합이 중복인 행이 지금 DB에 있을 수 있다. 그 상태에서 유니크 인덱스를 만들면 `mcp__supabase__apply_migration` 자체가 제약 위반으로 실패한다. 먼저 `mcp__supabase__execute_sql`로 확인한다:

```sql
select event_id, user_id, count(*), array_agg(id order by created_at) as participant_ids
from public.participants
where user_id is not null
group by event_id, user_id
having count(*) > 1;
```

- **결과가 0행이면** 바로 Step 2로 진행한다.
- **결과가 1행 이상이면** 마이그레이션을 적용하지 말고 멈춘다. 각 그룹의 `participant_ids` 목록(생성 시각순으로 정렬됨)을 그대로 사용자에게 보고하고, 어떻게 정리할지 확인받는다 — 일반적으로는 가장 먼저 생성된 행(배열의 첫 번째 id)만 남기고 나머지를 삭제하는 것이 맞지만(가장 이른 참여가 "진짜" 참여일 가능성이 높다), 참여자 목록에 실제로 다른 이름/메모가 들어있을 수 있으므로 **사용자 확인 없이 임의로 삭제하지 않는다.** 정리가 끝난 뒤에만 Step 2로 진행한다.

- [ ] **Step 2: 마이그레이션 적용**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출한다:

```
name: add_unique_participant_per_user_per_event
query:
-- 로그인 사용자의 참여는 이벤트당 최대 1건만 존재해야 한다. user_id가 null인 비회원 참여는
-- guest_token만으로 식별되므로 이 제약에서 제외한다(부분 인덱스).
-- 애플리케이션 레벨에서 이미 "먼저 조회 후 재사용"으로 막고 있지만, 동시 요청 레이스 컨디션까지
-- 막으려면 DB 제약이 필요하다.
create unique index if not exists participants_event_user_unique
  on public.participants(event_id, user_id)
  where user_id is not null;
```

- [ ] **Step 3: 인덱스 생성 확인**

`mcp__supabase__execute_sql` 도구로 확인한다:

```sql
select indexname, indexdef from pg_indexes
where tablename = 'participants' and indexname = 'participants_event_user_unique';
```

결과가 1행 나와야 하고, `indexdef`에 `WHERE (user_id IS NOT NULL)`이 포함되어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations
git commit -m "✨ feat: participants(event_id, user_id) 부분 유니크 인덱스 추가 — 로그인 사용자 중복 참여 방지"
```

---

### Task 2: `joinEvent`가 로그인 사용자의 기존 참여를 재사용하도록 수정

**Files:**

- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`

**Interfaces:**

- Consumes: Task 1의 유니크 인덱스, 기존 `getEventByShareToken`(event-repository), 기존 `countRegisteredParticipants`/`reactivateParticipation`(participant-repository)
- Produces:
  - `getParticipantByEventAndUser(supabase: SupabaseClient<Database>, eventId: string, userId: string): Promise<Participant | null>` — `src/repositories/participant-repository.ts`
  - `createParticipant`의 동작 변경: 유니크 제약 위반 시(동시 요청 레이스) 새 에러를 던지는 대신 기존 레코드를 조회해 반환한다.
  - `joinEvent`의 동작 변경: `userId`가 있으면 먼저 기존 참여를 조회해 있으면 그대로 반환(등록 상태) 또는 재활성화(취소 상태)하고, 없을 때만 새로 생성한다. 시그니처는 기존과 동일 — `joinEvent(supabase, shareToken, dto, userId?)`.

- [ ] **Step 1: repository에 (event_id, user_id) 조회 함수 추가**

`src/repositories/participant-repository.ts`의 `getParticipantByGuestToken` 함수 **바로 아래**에 추가한다:

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

- [ ] **Step 2: `createParticipant`가 유니크 제약 위반을 방어하도록 수정**

같은 파일의 `createParticipant` 함수를 다음으로 교체한다 (기존 함수 전체를 대체):

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

  if (error) {
    // 동시 요청으로 (event_id, user_id) 유니크 제약에 걸린 경우 — 이미 참여 중인 기존
    // 레코드를 그대로 반환한다(서비스 레이어의 "먼저 조회" 로직이 놓친 레이스 컨디션 방어)
    if (error.code === "23505" && userId) {
      const existing = await getParticipantByEventAndUser(
        supabase,
        eventId,
        userId,
      );
      if (existing) {
        return existing;
      }
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("참여 신청에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 3: `joinEvent` 서비스가 기존 참여를 먼저 조회하도록 수정**

`src/services/participant-service.ts`의 import 블록에서 participant-repository import 목록에 `getParticipantByEventAndUser`를 추가한다:

```ts
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  createParticipant as createParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  getParticipantByEventAndUser as getParticipantByEventAndUserRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
  reactivateParticipation as reactivateParticipationRepository,
} from "../repositories/participant-repository";
```

`joinEvent` 함수 전체를 다음으로 교체한다:

```ts
export async function joinEvent(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  // 로그인 사용자가 이 이벤트에 이미 참여한 적이 있다면 새 레코드를 만들지 않는다.
  // (다른 기기에서 같은 링크를 다시 열어 참여를 시도하는 경우 중복 생성을 막기 위함)
  if (userId) {
    const existing = await getParticipantByEventAndUserRepository(
      supabase,
      event.id,
      userId,
    );
    if (existing) {
      if (existing.status === "registered") {
        return existing;
      }
      // 취소했던 참여였다면 재활성화한다 (reactivateParticipation과 동일한 정원 재검증)
      if (event.max_participants !== null) {
        const registeredCount = await countRegisteredParticipantsRepository(
          supabase,
          event.id,
        );
        if (registeredCount >= event.max_participants) {
          throw new Error("이 이벤트는 정원이 가득 찼습니다.");
        }
      }
      return reactivateParticipationRepository(existing.guest_token);
    }
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

  return createParticipantRepository(
    supabase,
    event.id,
    {
      name: dto.name,
      memo: emptyToUndefined(dto.memo),
    },
    userId,
  );
}
```

> **설계 참고 (구현자에게):** 기존 참여를 재사용하는 경우, 사용자가 이번에 폼에 입력한 이름/메모는 무시되고 기존 레코드의 값이 그대로 유지된다. 이건 의도한 동작이다 — "참여는 멱등이다"라는 원칙을 지키기 위함이며, 사용자가 다른 기기에서 실수로 다른 이름을 입력했다고 해서 원래 참여 정보를 덮어써서는 안 된다. 메모를 바꾸고 싶다면 기존에 있는 "메모 수정" 흐름을 쓰면 된다.

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로 검증한다 (포트 3001):

1. `test-user@moija.dev`로 로그인 → 새 이벤트 생성 → 참여 링크 확인
2. 로그아웃하지 않은 채(같은 계정, 같은 브라우저) 그 참여 링크로 접속해 참여 신청 → 참여 완료 확인
3. `mcp__supabase__execute_sql`로 `select count(*) from participants where event_id = '<위 이벤트 id>'`를 실행해 정확히 1건인지 확인
4. **브라우저의 localStorage를 지운 뒤**(devtools 또는 `browser_evaluate`로 `localStorage.clear()`) 같은 참여 링크로 다시 접속 → 이름을 다르게 입력해 "참여하기" 클릭 → 에러 없이 완료 화면으로 넘어가는지 확인(내부적으로는 기존 레코드가 재사용된 것)
5. 다시 `select count(*) ...`로 여전히 1건인지 확인 (2건으로 늘지 않아야 함)
6. `select name from participants where event_id = '<이벤트 id>'`로 이름이 **처음 참여했을 때의 이름**으로 남아있는지 확인 (두 번째 시도에서 입력한 이름으로 덮어써지지 않아야 함)

- [ ] **Step 5: 커밋**

```bash
git add src/repositories/participant-repository.ts src/services/participant-service.ts
git commit -m "🐛 fix: 로그인 사용자가 같은 이벤트에 참여를 두 번 등록하지 못하도록 방지"
```

---

### Task 3: 참여 페이지가 로그인 사용자의 기존 참여를 서버에서 먼저 인식하도록 확장

> Task 2만으로도 데이터 중복은 완전히 막힌다. 이 Task는 UX를 마무리한다 — 로그인 사용자가 다른 기기에서 참여 링크를 열었을 때 빈 폼을 보여주고 제출을 유도하는 대신, 처음부터 "이미 참여 중" 상태를 곧장 보여준다.

**Files:**

- Modify: `src/services/participant-service.ts`
- Modify: `app/join/[share_token]/page.tsx`
- Modify: `components/join-form.tsx`

**Interfaces:**

- Consumes: Task 2의 `getParticipantByEventAndUser`(repository)
- Produces: `getJoinPageData`의 시그니처 확장 — `getJoinPageData(supabase, shareToken, userId?: string | null)`, 반환 타입에 `existingParticipant: { guestToken: string; name: string; memo: string | null; status: ParticipantStatus } | null` 필드 추가. `JoinForm` 컴포넌트가 `existingParticipant` prop을 받는다.

- [ ] **Step 1: `getJoinPageData`가 로그인 사용자의 기존 참여를 함께 반환하도록 확장**

`src/services/participant-service.ts`에서 `JoinPageData` 인터페이스를 다음으로 교체한다:

```ts
export interface JoinPageData {
  event: Event;
  registeredCount: number;
  isFull: boolean;
  existingParticipant: {
    guestToken: string;
    name: string;
    memo: string | null;
    status: ParticipantStatus;
  } | null;
}
```

파일 상단 import에 `ParticipantStatus` 타입을 추가한다:

```ts
import type {
  CreateParticipantDto,
  Event,
  Participant,
  ParticipantStatus,
} from "../types";
```

`getJoinPageData` 함수 전체를 다음으로 교체한다:

```ts
export async function getJoinPageData(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  userId?: string | null,
): Promise<JoinPageData | null> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    return null;
  }

  const registeredCount = await countRegisteredParticipantsRepository(
    supabase,
    event.id,
  );
  const isFull =
    event.max_participants !== null &&
    registeredCount >= event.max_participants;

  let existingParticipant: JoinPageData["existingParticipant"] = null;
  if (userId) {
    const participant = await getParticipantByEventAndUserRepository(
      supabase,
      event.id,
      userId,
    );
    if (participant) {
      existingParticipant = {
        guestToken: participant.guest_token,
        name: participant.name,
        memo: participant.memo,
        status: participant.status,
      };
    }
  }

  return { event, registeredCount, isFull, existingParticipant };
}
```

- [ ] **Step 2: 참여 페이지가 로그인 세션을 확인해 넘겨주도록 수정**

`app/join/[share_token]/page.tsx`의 `JoinPageContent` 함수를 다음으로 교체한다:

```tsx
async function JoinPageContent({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const data = await getJoinPageData(supabase, share_token, userId);

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-800">
          😕 유효하지 않은 참여 링크입니다.
        </p>
        <p className="mt-2 text-sm text-gray-500">링크를 다시 확인해주세요.</p>
      </main>
    );
  }

  return (
    <JoinForm
      shareToken={share_token}
      event={data.event}
      registeredCount={data.registeredCount}
      isFull={data.isFull}
      existingParticipant={data.existingParticipant}
    />
  );
}
```

- [ ] **Step 3: `JoinForm`이 `existingParticipant`로 초기 상태를 결정하도록 수정**

`components/join-form.tsx`의 `JoinFormProps` 인터페이스(89-94번 줄 부근)를 다음으로 교체한다:

```tsx
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
}
```

파일 상단 import에 `ParticipantStatus` 타입을 추가한다:

```tsx
import type { Event, ParticipantStatus } from "@/src/types";
```

`JoinForm` 함수 시그니처와 초기 state 선언부(96-119번 줄 부근)를 다음으로 교체한다:

```tsx
export default function JoinForm({
  shareToken,
  event,
  registeredCount,
  isFull,
  existingParticipant,
}: JoinFormProps) {
  const [state, setState] = useState<PageState>(() => {
    if (existingParticipant) {
      return existingParticipant.status === "cancelled"
        ? "cancelled"
        : "completed";
    }
    return isFull ? "full" : "form";
  });
  const [guestToken, setGuestToken] = useState<string | null>(
    existingParticipant?.guestToken ?? null,
  );
  // 참여/취소 후 서버가 돌려준 최신 인원수로 갱신 (초기값은 서버 렌더 시점 값)
  const [count, setCount] = useState(registeredCount);
  // 완료 문구는 방금 신청/재참여한 경우에만 노출 (재방문 시에는 부적절)
  const [justJoined, setJustJoined] = useState(false);

  // 신규 참여 폼 입력값
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 완료 상태에서 저장된 참여자 이름/메모
  const [savedName, setSavedName] = useState(existingParticipant?.name ?? "");
  const [editMemo, setEditMemo] = useState(existingParticipant?.memo ?? "");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
```

바로 아래의 재방문 인식 `useEffect`(122-142번 줄 부근)를 다음으로 교체한다:

```tsx
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
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로 검증한다 (포트 3001):

1. `test-user@moija.dev`로 로그인 → 새 이벤트 생성 → 참여 링크로 참여
2. **같은 계정으로 로그인된 상태에서 localStorage를 비운 뒤**(다른 기기를 흉내내기 위해 `browser_evaluate`로 `localStorage.clear()`) 같은 참여 링크에 재접속 → **빈 폼이 아니라 곧바로 "완료" 상태(메모 수정/참여 취소 버튼)가 보이는지** 확인 — 이게 이 Task의 핵심 검증 포인트
3. 로그아웃 후 같은 링크에 비회원으로 접속 → 여전히 정상적으로 빈 참여 폼이 뜨는지 확인 (비회원 흐름 회귀 없음)
4. Task 1~13에서 만들었던 기존 이벤트 중 하나로 비회원 참여 후 정상 동작(참여/취소/재참여) 회귀 확인

- [ ] **Step 5: 커밋**

```bash
git add src/services/participant-service.ts "app/join/[share_token]/page.tsx" components/join-form.tsx
git commit -m "✨ feat: 로그인 사용자가 다른 기기에서 참여 링크를 열어도 기존 참여 상태를 즉시 인식하도록 개선"
```

---

## Phase B — 재활성화 시 계정 연결 백필 (Minor #3)

### Task 4: 비회원으로 참여했다가 로그인 상태로 재참여하면 계정을 연결

> **배경:** 지난 플랜 최종 리뷰에서 parked된 Minor 항목. 사용자가 비회원으로 참여(`user_id = null`)했다가 나중에 계정을 만들고 로그인한 뒤 같은 기기에서 "참여 취소" → "다시 참여하기"를 누르면, 그 시점엔 로그인 상태인데도 `reactivateParticipation`이 `user_id`를 채우지 않아 "내가 참여한 이벤트" 목록에 영영 나타나지 않는다. 재활성화 시점에 로그인 세션이 있다면 `user_id`를 채워 넣는다.

**Files:**

- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`
- Modify: `src/controllers/participant-controller.ts`

**Interfaces:**

- Consumes: 기존 `reactivateParticipation`(모든 레이어), Task 2의 `getParticipantByEventAndUser`는 사용하지 않음(이건 이미 `guest_token`으로 찾은 특정 행을 갱신하는 다른 경로)
- Produces: `reactivateParticipation`(repository)이 선택적 `userId` 파라미터를 받아 `user_id`가 아직 비어 있을 때만 채운다. service/controller 레이어에 그 값을 전달하는 경로 추가.

- [ ] **Step 1: repository의 `reactivateParticipation`이 user_id를 조건부로 채우도록 수정**

`src/repositories/participant-repository.ts`의 `reactivateParticipation` 함수를 다음으로 교체한다:

```ts
export async function reactivateParticipation(
  guestToken: string,
  userId?: string | null,
): Promise<Participant> {
  const adminClient = createAdminClient();

  // user_id가 이미 채워져 있으면 덮어쓰지 않는다(다른 계정으로 잘못 연결되는 것을 방지) —
  // 비회원으로 참여했다가(user_id null) 로그인 상태로 재참여할 때만 백필한다.
  const updatePayload: { status: "registered"; user_id?: string } = {
    status: "registered",
  };
  if (userId) {
    const { data: current } = await adminClient
      .from("participants")
      .select("user_id")
      .eq("guest_token", guestToken)
      .maybeSingle();
    if (current && current.user_id === null) {
      updatePayload.user_id = userId;
    }
  }

  const { data, error } = await adminClient
    .from("participants")
    .update(updatePayload)
    .eq("guest_token", guestToken)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "재참여에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 2: service가 userId를 전달하도록 수정**

`src/services/participant-service.ts`의 `reactivateParticipation` 함수에서, `return reactivateParticipationRepository(guestToken);` 줄을 다음으로 교체한다:

```ts
export async function reactivateParticipation(
  supabase: SupabaseClient<Database>,
  guestToken: string,
  userId?: string | null,
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

  return reactivateParticipationRepository(guestToken, userId);
}
```

(함수 시그니처의 `userId?: string | null` 파라미터 추가와, 마지막 줄의 `reactivateParticipationRepository(guestToken, userId)` 호출이 변경점이다. 나머지는 그대로.)

Task 2에서 `joinEvent` 안에 있는 재활성화 호출(`return reactivateParticipationRepository(existing.guest_token);`)도 있는데, 그건 이미 `userId`가 있다는 게 확실한 분기 안이므로 그대로 `reactivateParticipationRepository(existing.guest_token, userId);`로 함께 수정한다.

- [ ] **Step 3: controller가 세션에서 userId를 읽어 전달하도록 수정**

`src/controllers/participant-controller.ts`의 `reactivateParticipationAction` 함수를 다음으로 교체한다:

```ts
export async function reactivateParticipationAction(
  guestToken: string,
): Promise<CountedActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  try {
    const participant = await reactivateParticipationService(
      supabase,
      guestToken,
      userId,
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
npm run typecheck && npm run lint
```

Playwright MCP로 검증한다:

1. **비로그인 상태로** 어떤 이벤트에 참여(비회원 참여, `user_id`는 null로 생성됨)
2. `mcp__supabase__execute_sql`로 `select id, user_id from participants where guest_token = '...'` (또는 이름으로 조회)해서 `user_id`가 null인지 확인
3. 참여 취소
4. **같은 브라우저에서 로그인**(같은 기기라 localStorage의 guest_token은 그대로 살아있다) → 참여 페이지로 돌아가 "다시 참여하기" 클릭
5. 다시 `select user_id from participants where guest_token = '...'`로 이번엔 로그인한 계정의 user_id가 채워졌는지 확인
6. `/dashboard`의 "내가 참여한 이벤트" 섹션에 이 이벤트가 나타나는지 확인

- [ ] **Step 5: 커밋**

```bash
git add src/repositories/participant-repository.ts src/services/participant-service.ts src/controllers/participant-controller.ts
git commit -m "✨ feat: 비회원으로 참여했다가 로그인 상태로 재참여 시 계정 연결 백필"
```

---

## Phase C — 자잘한 정리 (지난 플랜 최종 리뷰 parked 항목)

### Task 5: "내가 만든 이벤트" 정렬 기준을 "내가 참여한 이벤트"와 통일

> **배경:** `listEventsByOrganizer`는 `created_at desc`(최근 생성순), `listEventsByParticipantUserId`는 `event_date asc`(다가오는 일정순)로 서로 다르게 정렬된다. 최종 리뷰어가 "두 섹션이 다른 카드 컴포넌트를 같은 화면에 나란히 쓰면서 정렬 기준이 다르면 의도한 게 아닌 것처럼 보인다"고 지적했다. 다가오는 일정순이 두 섹션 모두에 더 유용하므로 그쪽으로 통일한다.

**Files:**

- Modify: `src/repositories/event-repository.ts`

**Interfaces:**

- Consumes/Produces 없음 — 기존 `listEventsByOrganizer`의 내부 정렬 기준만 변경

- [ ] **Step 1: 정렬 기준 변경**

`src/repositories/event-repository.ts`의 `listEventsByOrganizer` 함수 안, `.order("created_at", { ascending: false });` 줄(65번 줄 부근)을 다음으로 교체한다:

```ts
    .order("event_date", { ascending: true });
```

- [ ] **Step 2: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로: `test-user@moija.dev`로 로그인해 날짜가 서로 다른 이벤트 2~3개를 생성한 뒤 `/dashboard`의 "내가 만든 이벤트" 섹션이 날짜 빠른 순으로 나열되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add src/repositories/event-repository.ts
git commit -m "♻️ refactor: 내가 만든 이벤트 목록 정렬을 내가 참여한 이벤트와 동일하게 일정 임박순으로 통일"
```

---

### Task 6: 통계 차트 색상을 다크모드 대응 CSS 변수로 교체

> **배경:** `components/stats-charts.tsx`의 차트 색상이 `#111827`, `#6b7280`, `#d1d5db` 같은 라이트모드 전용 hex 값으로 하드코딩되어 있어 다크 테마에서 거의 안 보인다. 확인해보니 `app/globals.css`에 이미 라이트/다크 테마별로 값이 다른 `--chart-1`~`--chart-5` CSS 변수가 정의되어 있는데(shadcn 관례) 아무 데도 쓰이지 않고 있었다. 새 색상을 고안할 필요 없이 이미 있는 토큰에 연결하기만 하면 된다.

**Files:**

- Modify: `components/stats-charts.tsx`

**Interfaces:**

- Consumes/Produces 없음 — 순수 스타일 변경, props/데이터 흐름은 그대로

- [ ] **Step 1: `STATUS_COLORS` 상수를 CSS 변수 참조로 교체**

`components/stats-charts.tsx` 상단의 다음 줄:

```tsx
const STATUS_COLORS = ["#111827", "#6b7280", "#d1d5db"];
```

을 다음으로 교체한다:

```tsx
const STATUS_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
```

- [ ] **Step 2: 라인 차트("이벤트 생성 추이")의 하드코딩 색상 교체**

`<Line ... stroke="#111827" ... />`의 `stroke="#111827"`을 `stroke="var(--chart-1)"`로 교체한다.

- [ ] **Step 3: 영역 차트("사용자 가입 추이")의 하드코딩 색상 교체**

`<Area ... stroke="#6b7280" fill="#d1d5db" ... />`를 다음으로 교체한다 (별도 "옅은" 색상 변수를 새로 만드는 대신, 같은 색상에 투명도를 줘서 라이트/다크 양쪽에서 자연스럽게 옅어지도록 한다):

```tsx
<Area
  type="monotone"
  dataKey="count"
  name="가입자 수"
  stroke="var(--chart-2)"
  fill="var(--chart-2)"
  fillOpacity={0.25}
  strokeWidth={2}
/>
```

- [ ] **Step 4: 막대 차트("인기 이벤트 TOP 5")의 하드코딩 색상 교체**

`<Bar ... fill="#111827" ... />`의 `fill="#111827"`을 `fill="var(--chart-1)"`로 교체한다.

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint
```

Playwright MCP로: `test-admin@moija.dev`로 로그인해 `/admin/stats` 접속 → 라이트 모드에서 4개 차트가 이전과 비슷하게 보이는지 확인 → 우측 상단 테마 스위처로 다크 모드 전환 → 4개 차트 색상이 배경과 구분되어 잘 보이는지 확인(특히 파이 차트 조각과 막대 차트).

- [ ] **Step 6: 커밋**

```bash
git add components/stats-charts.tsx
git commit -m "🐛 fix: 통계 차트 색상이 다크 모드에서 거의 안 보이던 문제 수정 — 하드코딩 hex 대신 테마 CSS 변수 사용"
```

---

### Task 7: 통계 집계의 날짜 구간 계산을 서버 타임존과 무관하게 고정

> **배경:** `src/repositories/admin-repository.ts`의 `daysAgoStart`가 `new Date().setHours(0,0,0,0)` 같은 로컬 타임존 기반 메서드로 "30일 전" 시작 시각을 구한다. 라벨(`toKstDayLabel`)은 KST로 고정되어 있지만, 구간의 시작점 자체는 서버가 실행되는 타임존(Vercel은 UTC)에 따라 달라진다. 실제 영향을 분석해보면: UTC 서버에서는 시작점이 "KST 기준 그날 09:00"이 되어, 집계 구간의 가장 오래된 날(30일 전) 중 KST 00:00~09:00 사이에 생성된 이벤트/가입이 통계에서 통째로 빠진다(다른 날로 잘못 옮겨가는 게 아니라 아예 집계 안 됨). 발생 빈도는 낮지만(구간 경계의 9시간 슬라이스에만 해당) 실제 데이터 누락이므로 고친다.

**Files:**

- Modify: `src/repositories/admin-repository.ts`

**Interfaces:**

- Consumes/Produces 없음 — `daysAgoStart`의 내부 구현만 변경, 시그니처(`daysAgoStart(days: number): Date`)는 동일

- [ ] **Step 1: `daysAgoStart`를 KST 고정 연산으로 교체**

`src/repositories/admin-repository.ts`의 `daysAgoStart` 함수를 다음으로 교체한다:

```ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "days일 전 KST 자정"에 해당하는 실제 UTC 시각을 구한다. 서버가 어느 타임존에서 실행되든
// (Vercel은 UTC) 항상 같은 결과가 나오도록, 로컬 Date 메서드 대신 UTC getter/setter만 사용해
// KST 오프셋을 직접 더하고 뺀다. KST는 서머타임이 없는 고정 UTC+9라 이 계산이 항상 정확하다.
function daysAgoStart(days: number): Date {
  const now = new Date();
  // 현재 UTC 시각에 9시간을 더하면, 그 결과를 UTC 필드로 읽었을 때 "KST 벽시계 값"과 같아진다.
  const kstWallClock = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstWallClock.getUTCFullYear();
  const month = kstWallClock.getUTCMonth();
  const day = kstWallClock.getUTCDate() - (days - 1);
  // 위에서 구한 "KST 캘린더 날짜"의 00:00(KST)에 해당하는 실제 UTC 시각
  // = 그 날짜의 UTC 00:00에서 9시간을 뺀 값
  return new Date(Date.UTC(year, month, day) - KST_OFFSET_MS);
}
```

기존 함수가 `daysGo`를 쓰던 자리(파일 내 `daysAgoStart(days)` 호출부, `getEventCreationTrend`/`getUserSignUpTrend` 안)는 시그니처가 동일하므로 수정할 필요 없다.

- [ ] **Step 2: 검증**

```bash
npm run typecheck && npm run lint
```

`mcp__supabase__execute_sql`로 직접 계산을 검증한다. 예를 들어 오늘이 KST로 2026년 8월 8일이라면, `daysAgoStart(30)`은 "2026년 7월 10일 00:00 KST"에 해당하는 UTC 시각(`2026-07-09T15:00:00.000Z`)을 반환해야 한다. 브라우저 콘솔이나 `node -e`로 함수를 직접 호출해 확인하거나, 다음 SQL로 실제 기준 날짜를 계산해 대조한다:

```sql
select (now() at time zone 'Asia/Seoul')::date - interval '29 days' as expected_start_kst_date;
```

Playwright MCP로: `/admin/stats`의 "이벤트 생성 추이"/"사용자 가입 추이" 차트가 여전히 정상 렌더링되고, X축 첫 라벨이 정확히 30일 전 KST 날짜인지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add src/repositories/admin-repository.ts
git commit -m "🐛 fix: 통계 집계 기간의 시작 시각이 서버 타임존에 따라 어긋나던 문제 수정 — KST 자정으로 고정"
```

---

### Task 8: 로그인 폼 에러 메시지에 `role="alert"` 추가 (테스트 견고성 개선)

> **배경:** `tests/e2e/auth.spec.ts`의 "잘못된 비밀번호" 테스트가 `form p.text-red-500`이라는 CSS 클래스 로케이터로 에러 메시지를 찾고 있다. 동작은 하지만, 나중에 에러 메시지 스타일(클래스명)이 바뀌면 조용히 깨진다. 에러 문단에 `role="alert"`를 붙이고 테스트를 그 역할(role)로 찾도록 바꾸면 스타일 변경에 영향받지 않는다.

**Files:**

- Modify: `components/login-form.tsx`
- Modify: `tests/e2e/auth.spec.ts`

**Interfaces:**

- Consumes/Produces 없음 — 접근성 속성 추가와 테스트 로케이터 변경뿐

- [ ] **Step 1: 에러 메시지 문단에 `role="alert"` 추가**

`components/login-form.tsx`에서 `{/* 에러 메시지 영역 */}` 주석 다음 줄의:

<!-- prettier-ignore -->
```tsx
{error && <p className="text-sm text-red-500">{error}</p>}
```

을 다음으로 교체한다:

<!-- prettier-ignore -->
```tsx
{error && (
  <p role="alert" className="text-sm text-red-500">
    {error}
  </p>
)}
```

- [ ] **Step 2: 테스트 로케이터를 role 기반으로 교체**

`tests/e2e/auth.spec.ts`에서 "잘못된 비밀번호 → 에러 메시지 표시" 테스트 안의 다음 블록을:

```ts
// 로그인 폼에 "비밀번호를 잊으셨나요?" 링크가 추가되면서 느슨한 정규식이
// 페이지의 다른 텍스트(라벨 등)와도 매칭되어 strict mode violation이 발생했다.
// 실제 에러 메시지가 렌더링되는 영역(form 내 text-red-500 문단)으로 범위를 좁힌다.
await expect(page.locator("form p.text-red-500")).toBeVisible({
  timeout: 5000,
});
```

다음으로 교체한다:

```ts
// 에러 메시지 문단에 role="alert"를 붙여, 스타일(클래스명) 변경에 영향받지 않고
// 접근성 역할로 안정적으로 찾을 수 있게 한다.
await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
```

- [ ] **Step 3: 검증**

```bash
npm run typecheck && npm run lint
npx playwright test tests/e2e/auth.spec.ts
```

12/12 통과해야 한다(개발 서버가 포트 3001에서 떠 있어야 한다).

- [ ] **Step 4: 커밋**

```bash
git add components/login-form.tsx tests/e2e/auth.spec.ts
git commit -m "♻️ refactor: 로그인 에러 메시지에 role=alert 추가하고 E2E 로케이터를 접근성 역할 기반으로 변경"
```

---

### Task 9: `.prettierignore` 정리 및 로드맵 문서 갱신

**Files:**

- Modify: `.prettierignore`
- Modify: `docs/roadmaps/ROADMAP_v1.md`

**Interfaces:**

- Consumes/Produces 없음 — 문서/설정 정리

- [ ] **Step 1: SDD 작업 산출물 디렉터리를 prettier 검사에서 제외**

`.prettierignore`에 한 줄 추가한다:

```
.superpowers
```

(이 디렉터리는 이미 `.gitignore` 대상이라 커밋에는 안 잡히지만, `npm run format:check`가 워킹 디렉터리를 훑을 때 여기 있는 임시 마크다운 파일까지 검사해서 무관한 실패를 만들어냈다.)

- [ ] **Step 2: 로드맵 문서의 최종 업데이트 날짜 정정**

`docs/roadmaps/ROADMAP_v1.md`에서 `**최종 업데이트**: 2026-07-28`로 되어 있는 줄을, 이 Task를 실제로 완료하는 날짜로 교체한다(구현 시점의 실제 오늘 날짜를 쓴다 — 이 플랜을 작성한 시점이 아니라 Task 9를 실행하는 시점의 날짜).

같은 파일의 "현재 상태" 섹션 바로 아래(Phase 8 블록 다음)에 이번 플랜의 완료 기록을 추가한다:

```markdown
### Phase 9: 크로스 디바이스 중복 참여 방지 및 잔여 결함 정리 ✅

> 로그인 사용자가 다른 기기에서 참여 링크를 열었을 때 중복 참여 레코드가 생기던 문제 수정,
> 직전 플랜 최종 리뷰의 parked Minor 항목 정리
> 상세 계획: `docs/superpowers/plans/2026-08-08-cross-device-join-and-cleanup.md`

- **Task 023: 크로스 디바이스 중복 참여 방지** ✅ - 완료
  - [x] `participants(event_id, user_id)` 부분 유니크 인덱스 추가
  - [x] `joinEvent`가 로그인 사용자의 기존 참여를 재사용/재활성화하도록 수정
  - [x] 참여 페이지가 서버에서 기존 참여를 미리 인식해 즉시 올바른 상태를 표시

- **Task 024: 재활성화 시 계정 연결 백필** ✅ - 완료
  - [x] 비회원으로 참여했다가 로그인 상태로 재참여 시 `user_id` 백필

- **Task 025: 잔여 결함 정리** ✅ - 완료
  - [x] 내가 만든/참여한 이벤트 정렬 기준 통일
  - [x] 통계 차트 다크모드 색상 대비 수정
  - [x] 통계 집계 날짜 구간 계산 KST 고정
  - [x] 로그인 에러 메시지 접근성(role=alert) 개선 및 테스트 견고화
  - [x] `.prettierignore` 정리
```

- [ ] **Step 3: 검증**

```bash
npm run format:check
```

통과해야 한다.

- [ ] **Step 4: 커밋**

```bash
git add .prettierignore docs/roadmaps/ROADMAP_v1.md
git commit -m "📝 docs: prettierignore 정리 및 로드맵 Phase 9 완료 처리"
```

---

## Phase D — 최종 검증

### Task 10: 전체 회귀 검증

**Files:** 없음 (검증 전용 Task)

**Interfaces:** Task 1~9 전체 결과를 검증

- [ ] **Step 1: 전체 품질 게이트**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

`event-form.tsx:86` 경고 1건 외 새 경고/에러가 없어야 한다.

- [ ] **Step 2: 전체 E2E 스펙 실행**

```bash
npx playwright test
```

`auth.spec.ts`는 12/12 통과해야 한다(Task 8에서 로케이터를 바꿨으니 여전히 통과하는지 재확인). `app.spec.ts`는 기존과 동일하게 10건이 실패한다 — 이건 스타터킷 시절 더미 데이터/로케이터 모호성에 의한 것으로 이 플랜 이전부터 있던 것이며 이 플랜의 스코프가 아니다(직전 플랜에서 `main`과 대조해 이미 확인됨). 만약 실패 건수가 10건보다 늘었다면 이 플랜이 새 회귀를 만든 것이니 원인을 진단해 고쳐야 한다.

- [ ] **Step 3: 핵심 시나리오 수동 회귀 (Playwright MCP, 포트 3001)**

1. **크로스 디바이스 시나리오**: `test-user@moija.dev`로 로그인 → 이벤트 생성 → 참여 → localStorage 비우고 재접속 → 즉시 "완료" 상태로 인식되는지, DB에 참여 레코드가 1건뿐인지 확인 (Task 2, 3 종합 확인)
2. **비회원 흐름 회귀 없음**: 로그아웃 상태로 다른 이벤트에 참여 → 취소 → 재참여까지 기존과 동일하게 동작하는지 확인
3. **대시보드**: "내가 만든 이벤트"와 "내가 참여한 이벤트" 모두 일정 임박순으로 정렬되는지 확인 (Task 5)
4. **어드민 통계**: `/admin/stats`를 라이트/다크 모드 양쪽에서 확인해 차트가 잘 보이는지 확인 (Task 6)

- [ ] **Step 4: 커밋 없음 (검증 전용, 문제 발견 시에만 해당 Task로 돌아가 수정)**

---

## 부록: 이번 스코프에서 다루지 않은 것

- **`app/profile/page.tsx`의 프로필 row 누락 시 리다이렉트 동작** — 지난 플랜 리뷰에서 Minor로 지적됐지만(`handle_new_user` 트리거가 실패해야만 발생하는, 사실상 도달 불가능한 경로), 발생 확률이 극히 낮고 고치려면 인라인 에러 UI를 새로 설계해야 해서 이번 스코프에서 제외했다.
- **`participants` 테이블의 정원 체크 동시성** — 여러 사용자가 마지막 한 자리를 동시에 신청하면 정원을 초과해 등록될 수 있는 기존 이슈. 소규모 모임 대상 서비스라 실질 위험이 낮아 지난 플랜에서도 의도적으로 제외했고 이번에도 마찬가지다. 엄밀히 막으려면 DB 트랜잭션/잠금이 필요하며 별도 스코프다.
- **이벤트 커버 이미지 교체 시 기존 Storage 파일 미삭제** — 더 이전 플랜부터 스코프 밖으로 남아있는 항목.
- **`tests/e2e/app.spec.ts`의 10건 사전 존재 실패** — 스타터킷 시절 더미 데이터 픽스처(7건)와 로케이터/라벨 모호성 버그(3건). 고치려면 (a) 그 고정값과 일치하는 시드 데이터를 새로 심거나 (b) 10개 테스트를 동적 데이터 기반으로 재작성해야 하는데, 둘 다 이 플랜의 스코프(크로스 디바이스 버그 + 지난 리뷰 parked 항목)를 벗어나는 별도 작업이다.
