# 참여자 명단 공개(회원/비회원 뱃지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참여 완료 화면에 "함께 참여하는 사람들" 명단을 추가한다. 이 이벤트에 `registered` 상태로 참여한 사람만(회원/비회원 무관) 볼 수 있고, 각 참여자는 이름 + 아바타 + 회원/비회원 뱃지로 표시된다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 확장한다. 스키마 변경은 없다(`participants.user_id !== null`이 이미 "회원"을 의미). 접근 제어는 서비스 레이어의 `getEventParticipantRoster` 함수 하나가 유일한 보안 경계다 — 세션(`userId`) 또는 `guestToken`으로 "이 사람이 이 이벤트의 registered 참여자인가"를 검증한 뒤에만 명단을 반환한다. 클라이언트는 `join-form.tsx`가 `"completed"` 상태가 될 때 이 검증을 거쳐 명단을 조회한다.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase(Postgres + Auth), Playwright(자동화 e2e)

**Spec:** `docs/superpowers/specs/2026-08-16-participant-roster-design.md`

**설계 문서와의 차이(구현 중 확정):**

- 아바타 조회는 설계 문서가 언급한 `profiles(avatar_url)` 중첩 조인 대신, 이 코드베이스의 기존 패턴(`src/repositories/admin-repository.ts`의 `listEventsWithOrganizer`)을 그대로 따라 **두 번 쿼리 + Map으로 결합**한다. `participants.user_id`는 `auth.users(id)`를 참조하지 `public.profiles(id)`를 직접 참조하지 않아서(`supabase/migrations/20260803132419_add_user_id_to_participants.sql`), PostgREST의 암묵적 중첩 select(`profiles(avatar_url)`)가 관계를 자동으로 못 찾을 가능성이 높다. 의도는 설계 문서와 동일(회원 아바타 URL 가져오기), 구현 방식만 기존 코드베이스 패턴에 맞춘 것.
- 타입 `ParticipantRosterEntry`는 설계 문서가 리포지토리 파일에 두자고 했지만, 이 코드베이스는 `Event`/`Participant`/DTO/뷰모델 타입을 전부 `src/types/index.ts`에 모아두는 확립된 패턴이 있어(`AdminEventSummary` 등과 같은 "뷰 모델(조인 데이터 포함)" 섹션) 그 관례를 따른다.

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 수행한다. e2e 실행 시 `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`)과 `TEST_ADMIN_EMAIL`(`test-admin@moija.dev`) 계정이 Supabase에 존재해야 한다 — 없으면 먼저 만들거나 사람에게 확인한다. `test-admin@moija.dev`의 `profiles.full_name`은 정확히 `"테스트 관리자"`여야 한다(테스트가 이 값으로 회원 참여자 이름을 검증함).
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- **`getEventParticipantRoster` 서비스 함수의 본인 확인(세션 또는 guestToken) 체크는 반드시 포함해야 한다.** 이 체크를 빼고 이벤트 ID만으로 명단을 반환하는 코드는 리뷰에서 반려한다. (단, `participants` 테이블 SELECT RLS 자체가 이미 개방되어 있어 REST 직접 우회는 별도 트랙(백로그 `#11`)이며 이 플랜의 책임 범위가 아니다 — 애플리케이션 레이어 체크만 정확히 구현하면 된다.)
- 명단에 노출하는 필드는 정확히 이름·회원여부·아바타뿐이다. `memo`, `guest_token` 등 다른 필드를 조회 결과에 포함하는 코드는 리뷰에서 반려한다.

---

## Task 1: 데이터 조회 + 접근 제어 (리포지토리 → 서비스 → 컨트롤러)

> **배경:** 아직 UI는 없다(Task 2에서 추가). 이 Task가 끝나면 "본인이 이 이벤트의 registered 참여자인지 확인한 뒤에만 다른 참여자 명단을 반환하는" 서버 액션이 완성된 상태가 된다.

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`
- Modify: `src/controllers/participant-controller.ts`

**Interfaces:**

- Produces: `ParticipantRosterEntry { name: string; isMember: boolean; avatarUrl: string | null }` — `src/types/index.ts`
- Produces: `listRegisteredParticipantsForEvent(supabase, eventId): Promise<ParticipantRosterEntry[]>` — `src/repositories/participant-repository.ts`
- Produces: `getEventParticipantRoster(supabase, shareToken, userId, guestToken): Promise<ParticipantRosterEntry[]>` — `src/services/participant-service.ts`. `userId`/`guestToken` 둘 다 `string | null`. 본인 확인 실패 시 throw.
- Produces: `getEventParticipantsAction(shareToken: string, guestToken?: string): Promise<{ success: true; participants: ParticipantRosterEntry[] } | { success: false }>` — `src/controllers/participant-controller.ts`

- [ ] **Step 1: `ParticipantRosterEntry` 타입 추가**

`src/types/index.ts`의 "뷰 모델(조인 데이터 포함)" 섹션 맨 끝(`AdminUserSummary` 바로 아래)에 추가한다:

```ts
export interface ParticipantRosterEntry {
  name: string;
  isMember: boolean;
  avatarUrl: string | null;
}
```

- [ ] **Step 2: 리포지토리에 `listRegisteredParticipantsForEvent` 추가**

`src/repositories/participant-repository.ts`에서 다음 블록을:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateParticipantDto, Participant } from "../types";
import { createAdminClient } from "../../lib/supabase/admin";
```

다음으로 교체한다:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  CreateParticipantDto,
  Participant,
  ParticipantRosterEntry,
} from "../types";
import { createAdminClient } from "../../lib/supabase/admin";
```

파일 끝(`hardDeleteParticipant` 함수 바로 다음)에 추가한다:

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
    const { data: profiles, error: profilesError } = await supabase
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

- [ ] **Step 3: 서비스에 접근 제어 함수 `getEventParticipantRoster` 추가**

`src/services/participant-service.ts`에서 다음 블록을:

```ts
import type {
  CreateParticipantDto,
  Event,
  Participant,
  ParticipantStatus,
} from "../types";
import {
  getEventByShareToken as getEventByShareTokenRepository,
  getEventById as getEventByIdRepository,
} from "../repositories/event-repository";
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  countRegisteredBefore as countRegisteredBeforeRepository,
  createParticipant as createParticipantRepository,
  hardDeleteParticipant as hardDeleteParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  getParticipantByEventAndUser as getParticipantByEventAndUserRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
  reactivateParticipation as reactivateParticipationRepository,
} from "../repositories/participant-repository";
```

다음으로 교체한다:

```ts
import type {
  CreateParticipantDto,
  Event,
  Participant,
  ParticipantRosterEntry,
  ParticipantStatus,
} from "../types";
import {
  getEventByShareToken as getEventByShareTokenRepository,
  getEventById as getEventByIdRepository,
} from "../repositories/event-repository";
import {
  countRegisteredParticipants as countRegisteredParticipantsRepository,
  countRegisteredBefore as countRegisteredBeforeRepository,
  createParticipant as createParticipantRepository,
  hardDeleteParticipant as hardDeleteParticipantRepository,
  getParticipantByGuestToken as getParticipantByGuestTokenRepository,
  getParticipantByEventAndUser as getParticipantByEventAndUserRepository,
  updateParticipantMemo as updateParticipantMemoRepository,
  cancelParticipation as cancelParticipationRepository,
  reactivateParticipation as reactivateParticipationRepository,
  listRegisteredParticipantsForEvent as listRegisteredParticipantsForEventRepository,
} from "../repositories/participant-repository";
```

파일 끝(`countRegisteredByEventId` 함수 바로 다음)에 추가한다:

```ts
// 이 함수가 참여자 명단 기능의 유일한 보안 경계다 — 세션(userId) 또는 guestToken으로
// "본인이 이 이벤트의 registered 참여자인가"를 확인한 뒤에만 다른 참여자 명단을 돌려준다.
// UI가 완료 화면에서만 호출해도, 이 체크가 없으면 shareToken만으로 아무나 명단을 가져갈 수 있다.
export async function getEventParticipantRoster(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  userId: string | null,
  guestToken: string | null,
): Promise<ParticipantRosterEntry[]> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  let isVerifiedParticipant = false;

  if (userId) {
    const participant = await getParticipantByEventAndUserRepository(
      supabase,
      event.id,
      userId,
    );
    isVerifiedParticipant = participant?.status === "registered";
  } else if (guestToken) {
    const participant = await getParticipantByGuestTokenRepository(
      supabase,
      guestToken,
    );
    isVerifiedParticipant =
      participant?.event_id === event.id &&
      participant?.status === "registered";
  }

  if (!isVerifiedParticipant) {
    throw new Error("참여자만 볼 수 있습니다.");
  }

  return listRegisteredParticipantsForEventRepository(supabase, event.id);
}
```

- [ ] **Step 4: 컨트롤러에 `getEventParticipantsAction` 추가**

`src/controllers/participant-controller.ts`에서 다음 블록을:

```ts
import {
  joinEvent as joinEventService,
  getParticipantByGuestToken as getParticipantByGuestTokenService,
  updateParticipantMemo as updateParticipantMemoService,
  cancelParticipation as cancelParticipationService,
  reactivateParticipation as reactivateParticipationService,
  countRegisteredByEventId as countRegisteredByEventIdService,
} from "../services/participant-service";
import type { ParticipantStatus } from "../types";
```

다음으로 교체한다:

```ts
import {
  joinEvent as joinEventService,
  getParticipantByGuestToken as getParticipantByGuestTokenService,
  updateParticipantMemo as updateParticipantMemoService,
  cancelParticipation as cancelParticipationService,
  reactivateParticipation as reactivateParticipationService,
  countRegisteredByEventId as countRegisteredByEventIdService,
  getEventParticipantRoster as getEventParticipantRosterService,
} from "../services/participant-service";
import type { ParticipantRosterEntry, ParticipantStatus } from "../types";
```

파일 끝에 추가한다:

```ts
type GetRosterResult =
  | { success: true; participants: ParticipantRosterEntry[] }
  | { success: false };

export async function getEventParticipantsAction(
  shareToken: string,
  guestToken?: string,
): Promise<GetRosterResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;

  try {
    const participants = await getEventParticipantRosterService(
      supabase,
      shareToken,
      userId,
      guestToken ?? null,
    );
    return { success: true, participants };
  } catch {
    // 인가 실패든 이벤트 없음이든 이유를 클라이언트에 노출하지 않는다
    // (getParticipantByGuestTokenAction과 동일한 원칙).
    return { success: false };
  }
}
```

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

이 Task는 아직 호출하는 UI가 없어 typecheck/lint 통과가 곧 검증이다. 실제 동작(본인 확인 성공/실패, 명단 반환)은 Task 2의 e2e 테스트로 증명된다.

- [ ] **Step 6: 커밋**

```bash
git add src/types/index.ts src/repositories/participant-repository.ts src/services/participant-service.ts src/controllers/participant-controller.ts
git commit -m "✨ feat: 참여자 명단 조회 + 접근 제어 로직 추가"
```

---

## Task 2: 참여 완료 화면에 명단 UI 추가 + e2e

> **배경:** `"completed"` 상태가 되면 Task 1의 서버 액션으로 명단을 가져와 새 섹션으로 보여준다.

**Files:**

- Modify: `components/join-form.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**

- Consumes: Task 1의 `getEventParticipantsAction(shareToken, guestToken?)`, `ParticipantRosterEntry`

- [ ] **Step 1: import 추가**

`components/join-form.tsx`에서 다음 블록을:

```tsx
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
```

다음으로 교체한다:

```tsx
import { ArrowLeft, CalendarDays, MapPin, User, Users } from "lucide-react";
```

다음 블록을:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  joinEventAction,
  getParticipantByGuestTokenAction,
  updateParticipantMemoAction,
  cancelParticipationAction,
  reactivateParticipationAction,
} from "@/src/controllers/participant-controller";
import type { Event, ParticipantStatus } from "@/src/types";
```

다음으로 교체한다:

```tsx
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
```

- [ ] **Step 2: 아바타 헬퍼 컴포넌트 추가**

`components/join-form.tsx`에서 다음 블록을(`EventInfoCard` 함수의 끝):

```tsx
        {event.description && (
          <p className="text-sm whitespace-pre-wrap text-gray-600">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}

interface JoinFormProps {
```

다음으로 교체한다(즉 `EventInfoCard`와 `JoinFormProps` 사이에 새 컴포넌트를 끼워넣는다):

```tsx
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
```

- [ ] **Step 3: `participants` state와 조회 `useEffect` 추가**

`components/join-form.tsx`에서 다음 블록을:

```tsx
// 완료 상태에서 저장된 참여자 이름/메모
const [savedName, setSavedName] = useState(existingParticipant?.name ?? "");
const [editMemo, setEditMemo] = useState(existingParticipant?.memo ?? "");
const [isSavingMemo, setIsSavingMemo] = useState(false);
const [isCancelling, setIsCancelling] = useState(false);
```

다음으로 교체한다:

```tsx
// 완료 상태에서 저장된 참여자 이름/메모
const [savedName, setSavedName] = useState(existingParticipant?.name ?? "");
const [editMemo, setEditMemo] = useState(existingParticipant?.memo ?? "");
const [isSavingMemo, setIsSavingMemo] = useState(false);
const [isCancelling, setIsCancelling] = useState(false);

// 함께 참여하는 사람들 명단 (완료 상태에서만 조회)
const [participants, setParticipants] = useState<ParticipantRosterEntry[]>([]);
```

같은 파일에서 다음 블록을(재방문 인식 `useEffect`의 끝):

```tsx
      setState(
        result.participant.status === "cancelled" ? "cancelled" : "completed",
      );
    });
  }, [shareToken, existingParticipant]);

  // 참여하기 버튼 클릭 → 실제 참여 등록
  async function handleJoin() {
```

다음으로 교체한다(즉 재방문 인식 `useEffect`와 `handleJoin` 사이에 새 `useEffect`를 끼워넣는다):

```tsx
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
```

- [ ] **Step 4: "완료" 상태 화면에 명단 섹션 추가**

다음 블록(State 2 완료 카드가 끝나는 지점, State 3 취소 카드가 시작되는 지점 사이)을:

```tsx
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
```

다음으로 교체한다:

```tsx
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
```

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: e2e 테스트 3건 추가**

`tests/e2e/app.spec.ts`에서 다음 블록을(파일 맨 끝, `"참여 페이지 /join/{share_token}"` describe 블록을 닫는 마지막 부분):

```ts
  test("회원만 참가 이벤트도 로그인 상태면 choice 화면 없이 바로 참여 폼이 보인다(회귀)", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage, {
      membersOnly: true,
    });
    await authedPage.goto(`/join/${shareToken}`);
    await expect(authedPage.getByPlaceholder("홍길동")).toBeVisible();
    await expect(authedPage.getByText("참여 방법 선택")).not.toBeVisible();
    await authed.close();
  });
});
```

다음으로 교체한다(끝에 테스트 3개 추가):

```ts
  test("회원만 참가 이벤트도 로그인 상태면 choice 화면 없이 바로 참여 폼이 보인다(회귀)", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage, {
      membersOnly: true,
    });
    await authedPage.goto(`/join/${shareToken}`);
    await expect(authedPage.getByPlaceholder("홍길동")).toBeVisible();
    await expect(authedPage.getByText("참여 방법 선택")).not.toBeVisible();
    await authed.close();
  });

  test("참여자 명단에 회원/비회원이 뱃지와 함께 보인다", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    // 비회원 참가자 참여
    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await guestPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestPage.getByPlaceholder("홍길동").fill("비회원 참가자");
    await guestPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      guestPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();

    // 로그인 사용자(어드민 계정)도 같은 이벤트에 참여
    const member = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/admin.json",
    });
    const memberPage = await member.newPage();
    await memberPage.goto(`/join/${shareToken}`);
    await memberPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      memberPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();
    await member.close();

    // 비회원 참가자가 완료 화면을 새로고침하면 둘 다 명단에 보여야 한다
    await guestPage.reload();
    await expect(guestPage.getByText("함께 참여하는 사람들")).toBeVisible();
    const guestRow = guestPage.locator("li", { hasText: "비회원 참가자" });
    await expect(guestRow.getByText("비회원", { exact: true })).toBeVisible();
    const memberRow = guestPage.locator("li", { hasText: "테스트 관리자" });
    await expect(memberRow.getByText("회원", { exact: true })).toBeVisible();
    await guest.close();
  });

  test("참여하지 않은 방문자에게는 참여자 명단이 보이지 않는다", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await expect(
      guestPage.getByText("함께 참여하는 사람들"),
    ).not.toBeVisible();
    await guest.close();
  });

  test("참여를 취소한 사람은 명단에서 빠진다", async ({ browser }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guestA = await browser.newContext({ baseURL: BASE_URL });
    const guestAPage = await guestA.newPage();
    await guestAPage.goto(`/join/${shareToken}`);
    await guestAPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestAPage.getByPlaceholder("홍길동").fill("참가자A");
    await guestAPage.getByRole("button", { name: "참여하기" }).click();

    const guestB = await browser.newContext({ baseURL: BASE_URL });
    const guestBPage = await guestB.newPage();
    await guestBPage.goto(`/join/${shareToken}`);
    await guestBPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestBPage.getByPlaceholder("홍길동").fill("참가자B");
    await guestBPage.getByRole("button", { name: "참여하기" }).click();

    await guestBPage.getByRole("button", { name: "참여 취소" }).click();
    await expect(
      guestBPage.getByText("참여가 취소되었습니다."),
    ).toBeVisible();

    await guestAPage.reload();
    await expect(guestAPage.getByText("함께 참여하는 사람들")).toBeVisible();
    await expect(guestAPage.getByText("참가자A")).toBeVisible();
    await expect(guestAPage.getByText("참가자B")).not.toBeVisible();

    await guestA.close();
    await guestB.close();
  });
});
```

- [ ] **Step 7: 신규 테스트만 먼저 실행 확인**

```bash
npx playwright test tests/e2e/app.spec.ts -g "참여자 명단|참여하지 않은 방문자|참여를 취소한 사람"
```

4개(방금 추가한 3개 + Step 6에서 안 건드렸지만 관련된 기존 회귀 테스트가 있다면 그것도) 모두 통과해야 한다. 최소 새로 추가한 3개는 반드시 통과.

- [ ] **Step 8: 전체 e2e 스위트 회귀 확인**

```bash
npx playwright test
```

전부 통과해야 한다(실패 0건이 기준).

- [ ] **Step 9: 커밋**

```bash
git add components/join-form.tsx tests/e2e/app.spec.ts
git commit -m "✨ feat: 참여 완료 화면에 참여자 명단(회원/비회원 뱃지) 추가"
```

---

## Task 3: 백로그 문서 갱신

**Files:**

- Modify: `docs/superpowers/backlog-notes.md`

**Interfaces:** 없음(문서만 수정)

- [ ] **Step 1: `#5`/`#6` 항목에 완료 표시**

`docs/superpowers/backlog-notes.md`에서 다음 줄을:

```markdown
## #5 + #6: 참여자 목록 공개 + 회원/비회원 뱃지 (통합)
```

다음으로 교체한다:

```markdown
## #5 + #6: 참여자 목록 공개 + 회원/비회원 뱃지 (통합) ✅ 완료

> 설계: `docs/superpowers/specs/2026-08-16-participant-roster-design.md`
> 플랜: `docs/superpowers/plans/2026-08-16-participant-roster.md`
```

- [ ] **Step 2: `#11`에 SELECT RLS 구멍 내용 추가**

`docs/superpowers/backlog-notes.md`의 `#11` 섹션에서 다음 블록을:

```markdown
**문제:** `supabase/migrations/20260628000003_create_participants_table.sql`의 `"비회원 참여 등록"` 정책이 `to anon, authenticated` + `with check (true)`로 `participants` INSERT를 완전히 열어두고 있다. `events`도 `share_token으로 이벤트 공개 조회` 정책이 `using (true)`라 `event_id`를 얻기 쉽다. 즉 브라우저에 노출된 publishable key로 Supabase REST(`POST /rest/v1/participants`)에 직접 요청하면, `src/services/participant-service.ts`의 `joinEvent`(정원 체크, `#3`의 `members_only` 체크 등 모든 서버 방어 로직이 들어있는 곳)를 완전히 건너뛰고 참여자 행을 만들 수 있다.
```

다음으로 교체한다:

```markdown
**문제:** `supabase/migrations/20260628000003_create_participants_table.sql`의 `"비회원 참여 등록"` 정책이 `to anon, authenticated` + `with check (true)`로 `participants` INSERT를 완전히 열어두고 있다. `events`도 `share_token으로 이벤트 공개 조회` 정책이 `using (true)`라 `event_id`를 얻기 쉽다. 즉 브라우저에 노출된 publishable key로 Supabase REST(`POST /rest/v1/participants`)에 직접 요청하면, `src/services/participant-service.ts`의 `joinEvent`(정원 체크, `#3`의 `members_only` 체크 등 모든 서버 방어 로직이 들어있는 곳)를 완전히 건너뛰고 참여자 행을 만들 수 있다.

**추가 발견(`#5`/`#6` 구현 중):** SELECT 정책(`"주최자 참여자 목록 조회"`)도 이름과 달리 `using (true)`로 **anon 포함 누구나 전체 참여자 행(이름, 메모, `guest_token` 포함)을 읽을 수 있게** 열려 있다. `#5`/`#6`이 만든 참여자 명단 기능의 애플리케이션 레이어 접근 제어(`getEventParticipantRoster`)도 이 RLS 구멍을 통해 우회 가능하다 — 다만 그 우회로 얻는 정보(메모, guest_token)가 명단 기능이 의도적으로 노출하는 정보(이름, 회원여부, 아바타)보다 훨씬 민감해서, `#5`/`#6`이 새로운 위험을 추가한 것은 아니다.
```

`#3`, `#5`/`#6`, `#4`, `#8` 사이의 "브레인스토밍 시작 시 물어볼 것" 목록에 이미 있는 항목 1번(INSERT 정책 제거 + admin client 전환)이 SELECT에도 그대로 적용되니 별도 항목 추가는 하지 않는다.

- [ ] **Step 3: 포맷 검증 및 커밋**

```bash
npm run format:check
git add docs/superpowers/backlog-notes.md
git commit -m "📝 docs: 백로그 #5/#6(참여자 명단) 완료 처리 + #11에 SELECT RLS 내용 추가"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- `participants` SELECT RLS 종합 정비 — 백로그 `#11`에 기록, 별도 작업.
- `#7`(이벤트 암호 보호), `#4`(날짜 범위 모임), `#8`(로그인 시 헤더 노출) — 백로그 노트 참고, 별도 브레인스토밍.
- 실시간 명단 갱신(Supabase Realtime) — 브레인스토밍에서 명시적으로 제외 결정.
