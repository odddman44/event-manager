# 정원 동시성 및 잔여 결함 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직전 플랜(`2026-08-08-cross-device-join-and-cleanup.md`)에서 의도적으로 스코프 밖에 남겨둔 결함 5건을 우선순위 순으로 해결한다. 가장 중요한 것은 여러 사람이 마지막 한 자리를 동시에 신청할 때 정원을 초과해 등록되는 데이터 정합성 문제다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 유지한다. 정원 동시성은 DB 트랜잭션을 열 수 없는 Supabase JS 클라이언트의 제약을 우회하기 위해 **"낙관적 등록 후 순번 검증"** 방식을 쓴다 — 일단 참여 레코드를 만들고, 자기보다 먼저 등록된 참여자 수(= 자기 순번)를 세어 정원을 넘으면 자기 행을 지우고 에러를 던진다. 여러 요청이 동시에 들어와도 각자 자기 순번을 독립적으로 확인하므로 정확히 정원만큼만 살아남는다. 비즈니스 로직이 DB 함수로 내려가지 않아 기존 구조가 그대로 유지된다.

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres + RLS), Playwright, Tailwind v4

**참고 문서:**

- 직전 플랜(완료): `docs/superpowers/plans/2026-08-08-cross-device-join-and-cleanup.md`
- 로드맵: `docs/roadmaps/ROADMAP_v1.md`

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 날짜/시간 표시는 **반드시** `timeZone: "Asia/Seoul"`을 명시한다.
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- Server Action에서 `redirect()`는 반드시 `try/catch` 바깥에서 호출한다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 Playwright MCP로 수행한다. 테스트 계정은 `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`) / `TEST_ADMIN_EMAIL`(`test-admin@moija.dev`), 비밀번호는 둘 다 `TEST_USER_PASSWORD`/`TEST_ADMIN_PASSWORD`를 쓴다.
- **Playwright MCP 로그인 시 `browser_fill_form`을 쓰지 말 것.** 과거 이 도구가 이메일 필드 대신 "Continue with Google" 버튼을 눌러 실제 Google 계정으로 로그인되는 사고가 있었다. 반드시 `browser_type`을 `#email`, `#password` CSS 셀렉터로 개별 호출한다.
- **`browser_take_screenshot`에 `fullPage: true`를 쓰지 말 것.** recharts SVG가 렌더링되지 않은 채로 캡처된다. viewport 캡처(기본값)를 쓴다.
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- DB 마이그레이션은 `mcp__supabase__apply_migration` 도구로 적용한다. **이 도구는 원격 프로젝트에만 적용하고 로컬 `supabase/migrations/` 파일을 만들어주지 않는다.** 적용 후 `mcp__supabase__list_migrations`로 부여된 버전 문자열을 확인하고, `supabase/migrations/<버전>_<이름>.sql` 파일을 같은 내용으로 직접 작성해 커밋한다.

## 우선순위 근거

| Task | 항목                                    | 성격               | 우선순위 이유                                                     |
| ---- | --------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| 1    | 정원 초과 등록                          | 데이터 오류        | 실제로 잘못된 데이터가 생기고 주최자가 인원을 신뢰할 수 없게 된다 |
| 2    | 어드민 → 일반 페이지 진입 경로 없음     | UX 막힘            | 페이지는 멀쩡한데 URL 직접 입력 외엔 도달 불가                    |
| 3    | 커버 이미지 교체 시 Storage 파일 미삭제 | 리소스 누수        | 서서히 쌓이지만 사용자에게 보이지 않음                            |
| 4    | `app.spec.ts` 10건 실패                 | 테스트 위생        | 실패가 상시화되면 진짜 회귀를 놓친다                              |
| 5    | 프로필 row 누락 시 리다이렉트           | 도달 불가에 가까움 | `handle_new_user` 트리거가 실패해야만 발생                        |

---

## Task 1: 정원 초과 등록 방지 (등록 후 순번 검증)

> **배경:** `src/services/participant-service.ts`의 `joinEvent`는 "등록 인원 수를 센다 → 정원 미만이면 insert 한다" 순서로 동작한다. 두 사람이 마지막 한 자리를 동시에 신청하면 둘 다 카운트 단계에서 "아직 자리가 있다"를 보고 둘 다 insert에 성공해 정원을 초과한다. Supabase JS 클라이언트는 트랜잭션을 열 수 없어 카운트와 insert를 원자적으로 묶을 수 없으므로, 순서를 뒤집어 **먼저 insert 하고 자기 순번을 확인**한다. 자기보다 먼저 등록된(created_at이 이르거나, 같으면 id가 작은) registered 참여자 수가 `max_participants` 이상이면 자기 행을 삭제하고 정원 초과 에러를 던진다. 동시에 들어온 요청들이 각자 자기 순번을 독립적으로 계산하므로 정확히 정원만큼만 살아남는다.
>
> **기존 사전 카운트도 그대로 남긴다.** 대부분의 요청은 경쟁 상황이 아니라서, 사전 카운트가 있으면 불필요한 insert/delete 왕복 없이 즉시 거절할 수 있다. 사후 검증은 그 사전 카운트를 통과한 요청들 사이의 경쟁만 정리하는 안전망이다.

**Files:**

- Modify: `src/repositories/participant-repository.ts`
- Modify: `src/services/participant-service.ts`

**Interfaces:**

- Consumes: 기존 `createParticipant`, `countRegisteredParticipants`(participant-repository), 기존 `getEventByShareToken`(event-repository)
- Produces:
  - `countRegisteredBefore(supabase: SupabaseClient<Database>, eventId: string, createdAt: string, id: string): Promise<number>` — `src/repositories/participant-repository.ts`. 주어진 참여 레코드보다 **먼저** 등록된 registered 참여자 수를 반환한다(자기 자신은 세지 않는다).
  - `hardDeleteParticipant(id: string): Promise<void>` — `src/repositories/participant-repository.ts`. service_role 클라이언트로 참여 행을 물리 삭제한다. 정원 경쟁에서 밀린 자기 행을 되돌리는 용도로만 쓴다.
  - `joinEvent`의 동작 변경: 새 레코드를 만든 직후 순번을 검증한다. 시그니처는 기존과 동일 — `joinEvent(supabase, shareToken, dto, userId?)`.

- [ ] **Step 1: repository에 순번 카운트 함수 추가**

`src/repositories/participant-repository.ts`의 `getParticipantByEventAndUser` 함수 **바로 아래**에 추가한다:

```ts
// 주어진 참여 레코드보다 먼저 등록된 registered 참여자 수(= 그 레코드의 0-based 순번).
// created_at이 같은 경우 id 사전순으로 tie-break해서, 동시 요청들이 서로 다른 순번을 갖도록 보장한다.
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

- [ ] **Step 2: repository에 물리 삭제 함수 추가**

같은 파일의 `reactivateParticipation` 함수 **바로 아래**(파일 끝)에 추가한다. participants 테이블에는 anon/authenticated용 DELETE RLS 정책이 없으므로 service_role 클라이언트를 써야 한다:

```ts
// 정원 경쟁에서 밀린 자기 행을 되돌리는 용도. participants에는 anon/authenticated DELETE 정책이
// 없으므로(임의 행 삭제 취약점 차단) service_role 클라이언트로만 수행한다.
export async function hardDeleteParticipant(id: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("participants")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **Step 3: service의 import에 새 함수 두 개 추가**

`src/services/participant-service.ts`의 participant-repository import 블록을 다음으로 교체한다:

```ts
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

- [ ] **Step 4: `joinEvent`의 마지막 return을 사후 검증으로 교체**

`src/services/participant-service.ts`의 `joinEvent` 함수에서 **맨 마지막 `return createParticipantRepository(...)` 블록만** 다음으로 교체한다. 함수 앞부분(이벤트 조회, 로그인 사용자 기존 참여 재사용, 사전 정원 카운트)은 그대로 둔다:

```ts
  const created = await createParticipantRepository(
    supabase,
    event.id,
    {
      name: dto.name,
      memo: emptyToUndefined(dto.memo),
    },
    userId,
  );

  // 사전 카운트만으로는 동시 요청을 막지 못한다(카운트와 insert 사이에 다른 요청이 끼어든다).
  // 만들어진 뒤 자기 순번을 확인해, 정원을 넘겼다면 자기 행을 되돌리고 거절한다.
  // 경쟁한 요청들이 각자 자기 순번을 독립적으로 계산하므로 정확히 정원만큼만 살아남는다.
  if (event.max_participants !== null) {
    const rank = await countRegisteredBeforeRepository(
      supabase,
      event.id,
      created.created_at,
      created.id,
    );
    if (rank >= event.max_participants) {
      await hardDeleteParticipantRepository(created.id);
      throw new Error("이 이벤트는 정원이 가득 찼습니다.");
    }
  }

  return created;
}
```

> **설계 참고 (구현자에게):** 로그인 사용자의 기존 참여를 재사용/재활성화하는 분기는 사후 검증을 하지 않는다. 그 분기는 새 자리를 소비하지 않거나(이미 registered), 재활성화 직전에 정원을 다시 확인하기 때문이다. 재활성화 경로의 동시성은 이 플랜의 스코프가 아니다 — 취소했던 사람 여럿이 정확히 같은 순간에 재참여를 눌러야만 발생하고, 발생 확률이 신규 참여보다 훨씬 낮다.

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: 동시성 검증용 임시 스펙 작성 (이 Task의 핵심 — 건너뛰지 말 것)**

**순차로 3명이 참여해보는 것으로는 이 Task를 검증할 수 없다.** 그건 기존 사전 카운트만으로도 통과하기 때문에, 새로 넣은 사후 검증 로직이 동작하는지 알 수 없다. 반드시 **요청이 실제로 겹치게** 만들어야 한다.

또한 **로그인 상태로는 재현되지 않는다.** 직전 플랜에서 넣은 "로그인 사용자 기존 참여 재사용" 로직이 먼저 걸려 1건만 생성되기 때문이다. 각 참여자가 서로 다른 비회원이어야 한다.

`tests/e2e/capacity-race.temp.spec.ts` 파일을 새로 만든다 (검증 후 삭제한다):

```ts
import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3001";

// 정원 1명짜리 이벤트에 여러 비회원이 동시에 신청해도 딱 1명만 등록되는지 확인한다.
// 각 참여자는 독립 브라우저 컨텍스트(= 서로 다른 비회원)이고, 참여 버튼 클릭을
// Promise.all로 묶어 요청이 실제로 겹치게 만든다.
test("정원 1명 이벤트에 3명이 동시 신청하면 1명만 등록된다", async ({
  browser,
}) => {
  // 1) 로그인 컨텍스트에서 정원 1명 이벤트를 만든다
  const authed = await browser.newContext({
    baseURL: BASE_URL,
    storageState: "tests/.auth/user.json",
  });
  const authedPage = await authed.newPage();
  const title = `정원경쟁 검증 ${Date.now()}`;

  await authedPage.goto("/events/new");
  await authedPage.locator("input#title").fill(title);
  await authedPage.locator("input#event_date").fill("2026-12-31T19:00");
  await authedPage.locator("input#max_participants").fill("1");
  await authedPage.getByRole("button", { name: "이벤트 만들기" }).click();
  await authedPage.waitForURL(/\/events\/[0-9a-f-]{36}$/);

  const eventId = authedPage.url().split("/").pop()!;
  const bodyText = await authedPage.locator("body").innerText();
  const shareToken = bodyText.match(/\/join\/([A-Za-z0-9_-]+)/)![1];
  await authed.close();

  // 2) 서로 다른 비회원 3명이 참여 페이지를 연다
  const guests = await Promise.all(
    [0, 1, 2].map(async (i) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();
      await page.goto(`/join/${shareToken}`);
      await page.locator("#name").fill(`동시신청자${i}`);
      return { context, page };
    }),
  );

  // 3) 세 명이 동시에 참여 버튼을 누른다
  await Promise.all(
    guests.map(({ page }) =>
      page.getByRole("button", { name: "참여하기" }).click(),
    ),
  );

  // 4) 각 페이지가 "완료" 또는 "정원 초과" 중 하나로 정착할 때까지 기다린다
  await Promise.all(
    guests.map(({ page }) =>
      page
        .getByText(/참여 신청이 완료되었습니다!|정원이 가득/)
        .first()
        .waitFor({ timeout: 15000 }),
    ),
  );

  // 5) 정확히 1명만 완료 상태여야 한다
  const successCount = (
    await Promise.all(
      guests.map(({ page }) =>
        page.getByText("참여 신청이 완료되었습니다!").isVisible(),
      ),
    )
  ).filter(Boolean).length;

  await Promise.all(guests.map(({ context }) => context.close()));

  console.log(`EVENT_ID=${eventId}`);
  expect(successCount).toBe(1);
});
```

- [ ] **Step 7: 임시 스펙 실행 및 DB 대조**

개발 서버가 포트 3001에 떠 있는 상태에서:

```bash
npx playwright test tests/e2e/capacity-race.temp.spec.ts --workers=1
```

**통과해야 한다.** 출력에 찍힌 `EVENT_ID=<uuid>`를 기록한다. 이 값으로 DB를 직접 확인한다:

```sql
select count(*) as registered_count from public.participants
where event_id = '<EVENT_ID>' and status = 'registered';
```

**`registered_count`가 정확히 1이어야 한다.** 2 이상이면 사후 검증이 동작하지 않은 것이니 Step 4의 로직을 다시 확인한다.

밀려난 참여자들의 행이 제대로 삭제됐는지도 확인한다 — 아래 쿼리 결과가 **1행**(성공한 1명)이어야 하고, `cancelled` 상태로 남은 잔여물이 없어야 한다:

```sql
select name, status from public.participants where event_id = '<EVENT_ID>';
```

> **구현자에게:** 3개 요청이 우연히 충분히 겹치지 않아 사전 카운트만으로 걸러졌을 수도 있다. 그래도 테스트는 통과한다(결과는 같으므로). 사후 검증이 실제로 발동했는지 확실히 보려면, 개발 서버 로그나 `hardDeleteParticipantRepository` 호출부에 임시 `console.log`를 넣어 확인해도 좋다 — **확인 후 반드시 지운다.**

- [ ] **Step 8: 임시 스펙 삭제**

이 파일은 실행 시간이 길고 매번 이벤트를 만들어 데이터를 늘리므로 상시 스위트에 남기지 않는다:

```bash
rm tests/e2e/capacity-race.temp.spec.ts
```

- [ ] **Step 9: 기존 스위트 회귀 확인**

```bash
npx playwright test tests/e2e/auth.spec.ts
```

12/12 통과해야 한다.

- [ ] **Step 10: 커밋**

임시 스펙 파일은 Step 8에서 지웠으므로 커밋에 포함되지 않는다:

```bash
git add src/repositories/participant-repository.ts src/services/participant-service.ts
git commit -m "🐛 fix: 동시 신청 시 정원을 초과해 등록되던 문제 수정 — 등록 후 순번 검증으로 방어"
```

---

## Task 2: 어드민에서 일반 사용자 화면으로 이동하는 링크 추가

> **배경:** 어드민 계정도 `/dashboard`, `/events`, `/profile`에 접근할 수 있다(`proxy.ts`의 `USER_PROTECTED_PREFIXES`는 로그인 여부만 보고 role은 보지 않는다). 그런데 어드민 사이드바(`app/admin/(dashboard)/layout.tsx`)에는 어드민 메뉴 4개만 있고 일반 화면으로 가는 링크가 없다. 게다가 `proxy.ts`에서 어드민이 `/`(랜딩)에 접근하면 `/admin`으로 되돌려보내므로, **URL을 직접 입력하지 않으면 일반 사용자 화면에 도달할 방법이 아예 없다.** 지난 플랜에서 고친 "죽은 링크"의 반대 케이스다.

**Files:**

- Modify: `app/admin/(dashboard)/layout.tsx`

**Interfaces:**

- Consumes/Produces 없음 — 사이드바 마크업에 링크 하나 추가

- [ ] **Step 1: 사이드바 하단에 일반 화면 링크 추가**

`app/admin/(dashboard)/layout.tsx`에서 `ThemeSwitcher`/`AdminLogoutButton`이 들어있는 하단 블록을 다음으로 교체한다. `/`가 아니라 `/dashboard`로 직접 보내야 한다 — `/`로 보내면 `proxy.ts`가 어드민을 다시 `/admin`으로 되돌려 무한히 제자리걸음이 된다:

```tsx
<div className="mt-4 space-y-3 border-t pt-4">
  {/* 어드민 계정도 일반 사용자 화면을 쓸 수 있지만 진입 경로가 없었다.
              랜딩(/)으로 보내면 proxy가 어드민을 다시 /admin으로 되돌리므로 /dashboard로 직접 보낸다. */}
  <Link
    href="/dashboard"
    className="text-muted-foreground hover:bg-muted hover:text-foreground block rounded-md px-3 py-2 text-sm"
  >
    사용자 화면으로
  </Link>
  <div className="flex items-center justify-between">
    <ThemeSwitcher />
    <AdminLogoutButton />
  </div>
</div>
```

- [ ] **Step 2: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 3: 검증**

Playwright MCP로 (포트 3001):

1. `test-admin@moija.dev` / `TestPassword123!`로 로그인 (`browser_type`으로 `#email`, `#password` 개별 입력) → `/admin`으로 이동하는지 확인
2. 사이드바에 **"사용자 화면으로"** 링크가 보이는지 확인
3. 그 링크를 클릭 → `/dashboard`에 도착하고 "내가 만든 이벤트" / "내가 참여한 이벤트" 섹션이 보이는지 확인 (`/admin`으로 튕겨나가지 않아야 한다 — 이게 핵심 검증 포인트)
4. `/dashboard` 헤더의 "모이자" 로고 클릭 등 일반 네비게이션이 정상 동작하는지 확인
5. 일반 사용자(`test-user@moija.dev`)로 로그인해 `/admin` 접근 시 여전히 `/dashboard`로 리다이렉트되는지 확인 (권한 회귀 없음)

- [ ] **Step 4: 커밋**

```bash
git add "app/admin/(dashboard)/layout.tsx"
git commit -m "🚸 feat: 어드민 사이드바에 사용자 화면으로 이동하는 링크 추가"
```

---

## Task 3: 커버 이미지 교체/이벤트 삭제 시 기존 Storage 파일 정리

> **배경:** `src/services/event-service.ts`의 `updateEvent`는 새 커버 이미지가 오면 `uploadCoverImage`로 새 파일을 올리고 `cover_image_url`만 갈아끼운다. 기존 파일은 `event-covers` 버킷에 그대로 남아 영영 참조되지 않는다. 이벤트를 삭제할 때도 마찬가지다. 커버를 여러 번 바꿀수록 조용히 쌓인다.
>
> 파일 경로는 업로드 시 `${organizerId}/${crypto.randomUUID()}.${ext}` 형태로 만들어지고, 저장되는 값은 그 파일의 public URL이다. 삭제하려면 URL에서 버킷 뒤쪽 경로만 다시 뽑아내야 한다. public URL 형식은 `{SUPABASE_URL}/storage/v1/object/public/event-covers/{organizerId}/{uuid}.{ext}`이다.

**Files:**

- Modify: `src/repositories/event-repository.ts`
- Modify: `src/services/event-service.ts`

**Interfaces:**

- Consumes: 기존 `uploadCoverImage`, `deleteEvent`(event-repository), 기존 `getEventById`(event-repository)
- Produces:
  - `deleteCoverImage(supabase: SupabaseClient<Database>, publicUrl: string): Promise<void>` — `src/repositories/event-repository.ts`. public URL에서 storage 경로를 추출해 파일을 지운다. 경로를 못 뽑아내거나 삭제에 실패해도 **에러를 던지지 않는다**(정리 실패가 본 작업을 막으면 안 된다).

- [ ] **Step 1: repository에 커버 이미지 삭제 함수 추가**

`src/repositories/event-repository.ts`의 `uploadCoverImage` 함수 **바로 아래**에 추가한다:

```ts
const COVER_BUCKET = "event-covers";

// 저장된 public URL에서 버킷 내부 경로(`{organizerId}/{uuid}.{ext}`)를 다시 뽑아낸다.
// 형식이 예상과 다르면(외부 URL 등) null을 반환해 호출부가 조용히 건너뛰게 한다.
function extractCoverPath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const path = publicUrl.slice(index + marker.length);
  return path.length > 0 ? path : null;
}

// 커버 교체/이벤트 삭제 후 남는 고아 파일을 정리한다. 정리 실패가 본 작업(수정/삭제)을
// 되돌리게 해서는 안 되므로 에러를 삼킨다.
export async function deleteCoverImage(
  supabase: SupabaseClient<Database>,
  publicUrl: string,
): Promise<void> {
  const path = extractCoverPath(publicUrl);
  if (!path) {
    return;
  }
  await supabase.storage.from(COVER_BUCKET).remove([path]);
}
```

- [ ] **Step 2: service의 import에 `deleteCoverImage` 추가**

`src/services/event-service.ts`의 event-repository import 블록에 `deleteCoverImage as deleteCoverImageRepository`를 추가한다. 기존 import 목록의 형태를 그대로 따르고, 이미 import된 이름을 지우지 않는다.

- [ ] **Step 3: `updateEvent`가 교체된 기존 커버를 지우도록 수정**

`src/services/event-service.ts`의 `updateEvent` 함수에서 커버 업로드 블록을 다음으로 교체한다:

```ts
let coverImageUrl = event.cover_image_url ?? undefined;
if (coverImageFile) {
  const validationError = validateCoverImage(coverImageFile);
  if (validationError) {
    throw new Error(validationError);
  }
  coverImageUrl = await uploadCoverImageRepository(
    supabase,
    organizerId,
    coverImageFile,
  );
  // 새 파일 업로드가 성공한 뒤에 이전 파일을 지운다. 순서를 뒤집으면 업로드가
  // 실패했을 때 이벤트가 커버를 잃는다.
  if (event.cover_image_url) {
    await deleteCoverImageRepository(supabase, event.cover_image_url);
  }
}
```

- [ ] **Step 4: `deleteEventByOrganizer`가 커버도 함께 지우도록 수정**

`src/services/event-service.ts`의 `deleteEventByOrganizer` 함수를 다음으로 교체한다:

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

  await deleteEventRepository(supabase, eventId);
  // 이벤트 행이 사라진 뒤에는 이 커버를 참조할 곳이 없다.
  if (event.cover_image_url) {
    await deleteCoverImageRepository(supabase, event.cover_image_url);
  }
}
```

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: 검증**

먼저 현재 버킷에 들어있는 파일 목록을 기록해둔다:

```sql
select name, created_at from storage.objects
where bucket_id = 'event-covers' order by created_at desc limit 20;
```

Playwright MCP로 (포트 3001), `test-user@moija.dev`로 로그인한 뒤:

1. 새 이벤트를 만들면서 커버 이미지를 하나 올린다 (`browser_file_upload` 사용, 아무 png 파일이면 된다 — 없다면 `/join/`류 스크린샷을 임시로 만들어 쓴다)
2. 위 SQL을 다시 실행해 파일이 1개 늘었는지 확인하고, 그 `name`(경로)을 기록한다
3. 그 이벤트의 수정 페이지(`/events/<id>/edit`)에서 **다른** 커버 이미지로 교체하고 저장한다
4. SQL을 다시 실행한다 → **2번에서 기록한 경로가 사라지고 새 경로 1개만 있어야 한다** (총 개수가 늘지 않아야 함) — 이게 이 Task의 핵심 검증 포인트
5. 그 이벤트를 삭제한다
6. SQL을 다시 실행한다 → **3번에서 올린 새 경로도 사라져야 한다**
7. 커버 이미지가 **없는** 이벤트를 하나 만들고 바로 삭제해, `cover_image_url`이 null일 때 에러 없이 삭제되는지 확인한다 (회귀 방지)

- [ ] **Step 7: 커밋**

```bash
git add src/repositories/event-repository.ts src/services/event-service.ts
git commit -m "🐛 fix: 커버 이미지 교체/이벤트 삭제 시 Storage에 고아 파일이 남던 문제 수정"
```

---

## Task 4: `app.spec.ts`의 사전 존재 실패 10건을 실데이터 기반으로 재작성

> **배경:** `tests/e2e/app.spec.ts`의 35개 테스트 중 10개가 계속 실패한다. 원인은 두 부류인데 뿌리는 같다 — **스타터킷의 UI 마크업 단계에서 작성된 테스트가 실데이터 연동 이후 갱신되지 않았다.**
>
> - 존재하지 않는 더미 데이터를 기대: `2025 개발자 네트워킹 밤`, `DEV2025`, `김민준`, `총 10명`, `/events/1`, `/join/demo-token`
> - 이미 바뀐 UI를 기대: `/admin` 카드 라벨이 `진행 중 이벤트`/`이번 달 신규` → 실제로는 `총 참여자 수`/`진행 예정 이벤트`, 하단 네비의 `홈` 탭은 커밋 `08b9ef4`에서 제거됨(실제 탭은 `이벤트`/`새 이벤트`/`프로필`)
>
> 이 Task는 10건을 실제로 존재하는 데이터를 만들어 검증하도록 고친다. 시드 데이터에 의존하지 않으므로 앞으로 데이터가 바뀌어도 깨지지 않는다.

**Files:**

- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**

- Consumes/Produces 없음 — 테스트 파일만 수정. 애플리케이션 코드는 건드리지 않는다.

- [ ] **Step 1: 이벤트를 만들어 쓰는 헬퍼를 파일 상단에 추가**

`tests/e2e/app.spec.ts`의 `import` 문 **바로 아래**에 추가한다:

```ts
// browser.newContext()로 만든 컨텍스트는 playwright.config.ts의 use.baseURL을 상속하지
// 않으므로(fixture가 아니라 raw browser API다) 직접 넘겨야 상대 경로 goto가 동작한다.
const BASE_URL = "http://localhost:3001";

// 스타터킷 시절 고정 더미 데이터에 의존하던 테스트들을, 테스트가 직접 만든 이벤트로
// 검증하도록 바꾸기 위한 헬퍼. 이름에 타임스탬프를 넣어 병렬/반복 실행에도 충돌하지 않는다.
async function createEvent(
  page: Page,
  options: { maxParticipants?: number } = {},
): Promise<{ title: string; eventId: string; shareToken: string }> {
  const title = `E2E 이벤트 ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  await page.goto("/events/new");
  await page.locator("input#title").fill(title);
  await page.locator("input#event_date").fill("2026-12-31T19:00");
  if (options.maxParticipants !== undefined) {
    await page
      .locator("input#max_participants")
      .fill(String(options.maxParticipants));
  }
  await page.getByRole("button", { name: "이벤트 만들기" }).click();

  // 생성 성공 시 /events/{id}로 이동한다
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop()!;

  // 상세 페이지에 표시된 공유 링크에서 share_token을 뽑아낸다.
  // 특정 요소를 로케이터로 집으면 마크업이 바뀔 때 깨지므로 페이지 텍스트 전체에서 찾는다.
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/\/join\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error("이벤트 상세 페이지에서 공유 링크를 찾지 못했습니다.");
  }
  const shareToken = match[1];

  return { title, eventId, shareToken };
}
```

`Page` 타입을 쓰므로 파일 맨 위 import 문을 다음으로 교체한다:

```ts
import { test, expect, type Page } from "@playwright/test";
```

- [ ] **Step 2: 어드민 대시보드 테스트 2건 수정**

`test.describe("어드민 대시보드 /admin", ...)` 안의 두 테스트를 다음으로 교체한다. 사이드바 링크는 페이지 본문의 같은 이름 텍스트와 겹치므로 `aside`로 범위를 좁히고, 카드 라벨은 실제 값으로 바꾼다:

```ts
test("사이드바에 4개 메뉴가 있다", async ({ page }) => {
  await page.goto("/admin");
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("link", { name: "대시보드" })).toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: "이벤트 관리" }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: "사용자 관리" }),
  ).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "통계 분석" })).toBeVisible();
});

test("통계 카드 4개가 표시된다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("총 이벤트")).toBeVisible();
  await expect(page.getByText("총 사용자")).toBeVisible();
  await expect(page.getByText("총 참여자 수")).toBeVisible();
  await expect(page.getByText("진행 예정 이벤트")).toBeVisible();
});
```

- [ ] **Step 3: 어드민 이벤트 관리 테스트 수정**

`test.describe("어드민 이벤트 관리 /admin/events", ...)` 안의 테스트를 다음으로 교체한다. 페이지 제목("이벤트 관리")은 사이드바 링크와도 겹치므로 heading으로 특정한다:

```ts
test("이벤트 테이블과 삭제 버튼이 표시된다", async ({ page }) => {
  await page.goto("/admin/events");
  await expect(
    page.getByRole("heading", { name: "이벤트 관리" }),
  ).toBeVisible();
  // 테이블 헤더는 데이터와 무관하게 항상 있어야 한다
  await expect(page.getByRole("columnheader", { name: "제목" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "삭제" }).first(),
  ).toBeVisible();
});
```

- [ ] **Step 4: 어드민 사용자 관리 테스트 수정**

`test.describe("어드민 사용자 관리 /admin/users", ...)` 안의 테스트를 다음으로 교체한다. 사용자 수는 계속 변하므로 고정값 대신 형식만 검증하고, 반드시 존재하는 테스트 계정으로 확인한다:

```ts
test("사용자 목록이 표시된다", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "사용자 관리" }),
  ).toBeVisible();
  // 총 인원은 계속 변하므로 정확한 숫자 대신 "총 N명" 형식만 확인한다
  await expect(page.getByText(/총 \d+명/)).toBeVisible();
  // 테스트 계정은 항상 존재한다
  await expect(page.getByText(process.env.TEST_USER_EMAIL!)).toBeVisible();
});
```

- [ ] **Step 5: 주최자 대시보드 테스트 2건 수정**

`test.describe("주최자 대시보드 /dashboard", ...)` 안의 두 테스트를 다음으로 교체한다. 하단 네비의 `홈` 탭은 제거됐으므로 실제 탭 3개를 검증한다:

```ts
test("모이자 헤더와 이벤트 카드가 표시된다", async ({ page }) => {
  const { title } = await createEvent(page);
  await page.goto("/dashboard");
  await expect(page.locator("header").getByText("모이자")).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
});

test("모바일 하단 네비게이션이 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const bottomNav = page.locator("nav.fixed");
  await expect(bottomNav.getByText("이벤트")).toBeVisible();
  await expect(bottomNav.getByText("새 이벤트")).toBeVisible();
  await expect(bottomNav.getByText("프로필")).toBeVisible();
});
```

- [ ] **Step 6: 이벤트 관리 테스트 2건 수정**

`test.describe("이벤트 관리 /events/1", ...)` 블록 **전체**를 다음으로 교체한다(describe 이름도 바뀐다):

```ts
// ──────────────────────────────────────────────
// 이벤트 관리 /events/{id}
// ──────────────────────────────────────────────
test.describe("이벤트 관리 /events/{id}", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("이벤트 정보와 공유 링크가 표시된다", async ({ page }) => {
    const { title, shareToken } = await createEvent(page);
    await expect(page.getByText(title)).toBeVisible();
    await expect(
      page.getByText(new RegExp(`/join/${shareToken}`)),
    ).toBeVisible();
  });

  test("참여자가 없으면 안내 문구가 표시된다", async ({ page }) => {
    await createEvent(page);
    await expect(page.getByText("참여자 목록")).toBeVisible();
    await expect(page.getByText("아직 참여자가 없습니다.")).toBeVisible();
  });
});
```

- [ ] **Step 7: 참여 페이지 테스트 2건 수정**

`test.describe("참여 페이지 /join/demo-token", ...)` 블록 **전체**를 다음으로 교체한다. 참여는 비회원 흐름이라 로그인 세션이 없어야 하는데, 이벤트를 만들려면 로그인이 필요하므로 두 컨텍스트를 분리한다:

```ts
// ──────────────────────────────────────────────
// 참여 페이지 /join/{share_token}
// ──────────────────────────────────────────────
test.describe("참여 페이지 /join/{share_token}", () => {
  test("이벤트 정보와 참여 폼이 표시된다", async ({ browser }) => {
    // 이벤트 생성은 로그인 컨텍스트에서, 참여는 비회원 컨텍스트에서 수행한다.
    // 로그인 상태로 참여하면 "이미 참여 중" 인식 로직이 걸려 빈 폼이 뜨지 않는다.
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { title, shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await expect(guestPage.getByText(title)).toBeVisible();
    await expect(
      guestPage.getByRole("button", { name: "참여하기" }),
    ).toBeVisible();
    await guest.close();
  });

  test("이름 입력 후 참여하면 완료 상태로 전환된다", async ({ browser }) => {
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
    await guestPage.getByPlaceholder("홍길동").fill("테스트 참여자");
    await guestPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      guestPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();
    await guest.close();
  });
});
```

- [ ] **Step 8: 전체 스펙 실행**

개발 서버가 포트 3001에 떠 있는 상태에서:

```bash
npx playwright test
```

**35/35 전부 통과해야 한다.** 실패가 남으면 그 테스트의 실제 화면을 Playwright MCP로 직접 열어보고 기대값을 실제 마크업에 맞춘다. 임의로 테스트를 삭제하거나 `test.skip`으로 넘기지 않는다.

- [ ] **Step 9: 타입/린트/포맷 검증**

```bash
npm run typecheck && npm run lint && npm run format:check
```

- [ ] **Step 10: 커밋**

```bash
git add tests/e2e/app.spec.ts
git commit -m "✅ test: app.spec.ts의 스타터킷 더미 데이터 의존 테스트 10건을 실데이터 기반으로 재작성"
```

---

## Task 5: 프로필 row 누락 시 리다이렉트 대신 인라인 에러 표시

> **배경:** `app/profile/page.tsx`는 `profiles` 조회 결과가 없으면 `/auth/login`으로 리다이렉트한다. 하지만 이 시점에는 이미 인증이 확인된 상태라서(바로 위에서 `userId`를 얻었다), 로그인 페이지로 보내면 `proxy.ts`가 로그인된 사용자를 다시 `/dashboard`로 돌려보내 사용자는 영문을 모른 채 튕긴다. 실제로는 `handle_new_user` 트리거가 실패해야만 생기는 사실상 도달 불가능한 경로지만, 발생하면 원인을 알 수 없는 무한 튕김처럼 보인다. 로그인 페이지로 보내는 대신 무슨 일이 일어났는지 화면에 알려준다.

**Files:**

- Modify: `app/profile/page.tsx`

**Interfaces:**

- Consumes/Produces 없음 — 한 개 분기의 처리 방식 변경

- [ ] **Step 1: 프로필 누락 분기를 인라인 에러 UI로 교체**

`app/profile/page.tsx`의 `ProfileContent` 함수에서 다음 블록을:

```tsx
if (!profile) {
  redirect("/auth/login");
}
```

다음으로 교체한다:

```tsx
// 인증은 이미 확인된 상태라 로그인 페이지로 보내면 proxy가 다시 대시보드로 되돌려
// 원인을 알 수 없는 튕김이 된다. 프로필 row가 없는 건 가입 트리거가 실패한 경우뿐이므로
// 무슨 일이 일어났는지 화면에 알린다.
if (!profile) {
  return (
    <div className="rounded-card bg-card space-y-3 border p-6 text-center shadow-sm">
      <p className="font-medium">😕 프로필 정보를 불러오지 못했습니다.</p>
      <p className="text-muted-foreground text-sm">
        계정은 정상이지만 프로필 정보가 만들어지지 않았습니다. 잠시 후 다시
        시도해도 같은 화면이 보이면 관리자에게 문의해주세요.
      </p>
      <LogoutButton />
    </div>
  );
}
```

`LogoutButton`은 이 파일에 이미 import되어 있으므로 추가 import가 필요 없다. `redirect`는 위쪽 `if (!userId)` 분기에서 여전히 쓰이므로 import를 지우지 않는다.

- [ ] **Step 2: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

`redirect` import가 사용되지 않는다는 경고가 나오면 `if (!userId)` 분기를 실수로 지운 것이니 되돌린다.

- [ ] **Step 3: 검증**

이 경로는 정상적으로는 도달할 수 없으므로 DB를 일시적으로 조작해 확인한다. **반드시 확인 후 원상복구한다.**

1. Playwright MCP로 `test-user@moija.dev`로 로그인 → `/profile` 접속 → 이름/이메일/가입일이 정상 표시되는지 확인
2. `mcp__supabase__execute_sql`로 프로필 행을 임시 백업하고 지운다:

```sql
-- 백업 (반환값을 그대로 기록해둔다)
select id, email, full_name, avatar_url, role, created_at, updated_at
from public.profiles where email = 'test-user@moija.dev';

-- 삭제
delete from public.profiles where email = 'test-user@moija.dev';
```

3. `/profile`을 새로고침 → **"😕 프로필 정보를 불러오지 못했습니다."와 로그아웃 버튼이 보여야 한다.** `/auth/login`이나 `/dashboard`로 튕기지 않아야 한다 — 이게 핵심 검증 포인트
4. **즉시 복구한다.** 2번에서 백업한 값으로 다시 삽입한다:

```sql
insert into public.profiles (id, email, full_name, avatar_url, role, created_at, updated_at)
values ('<백업한 id>', '<백업한 email>', <백업한 full_name>, <백업한 avatar_url>,
        '<백업한 role>', '<백업한 created_at>', '<백업한 updated_at>');
```

5. `/profile`을 다시 열어 원래대로 표시되는지 확인한다

> **구현자에게:** `profiles.id`는 `auth.users`를 참조하는 외래키이므로 프로필 행만 지워도 계정 자체는 남는다. 그래도 3~4번 사이에 다른 작업을 끼워넣지 말고 곧바로 복구할 것.

- [ ] **Step 4: 커밋**

```bash
git add app/profile/page.tsx
git commit -m "🩹 fix: 프로필 정보 누락 시 로그인 페이지로 튕기지 않고 인라인 안내를 표시"
```

---

## Task 6: 최종 회귀 검증 및 로드맵 갱신

**Files:**

- Modify: `docs/roadmaps/ROADMAP_v1.md`

**Interfaces:** Task 1~5 전체 결과를 검증

- [ ] **Step 1: 전체 품질 게이트**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

`components/event-form.tsx:86` 경고 1건 외 새 경고/에러가 없어야 한다.

- [ ] **Step 2: 전체 E2E 실행**

```bash
npx playwright test
```

**35/35 전부 통과해야 한다.** 직전 플랜 시점에는 `app.spec.ts` 10건이 실패하는 게 정상이었지만, Task 4에서 고쳤으므로 이제 실패가 하나도 없어야 한다.

- [ ] **Step 3: 핵심 시나리오 수동 회귀 (Playwright MCP, 포트 3001)**

1. **정원**: 정원 2명 이벤트를 만들고 비회원으로 2명 참여 → 3번째 접속 시 "정원이 가득 찼어요" 화면이 뜨는지, DB에 registered 행이 정확히 2건인지 확인 (Task 1)
2. **어드민 이동**: `test-admin`으로 로그인 → 사이드바 "사용자 화면으로" 클릭 → `/dashboard` 도착 (Task 2)
3. **커버 정리**: 이벤트 커버를 교체하고 `storage.objects`에서 파일 수가 늘지 않는지 확인 (Task 3)
4. **크로스 디바이스 회귀**: 로그인 상태로 참여한 뒤 `localStorage.clear()` 후 재접속 → 즉시 "완료" 상태가 뜨고 DB 참여 행이 1건인지 확인 (직전 플랜 기능의 회귀 없음)
5. **비회원 회귀**: 로그아웃 상태로 참여 → 취소 → 재참여가 정상 동작하는지 확인

- [ ] **Step 4: 전역 중복 참여 확인**

```sql
select count(*) from (
  select event_id, user_id from public.participants
  where user_id is not null group by event_id, user_id having count(*) > 1
) d;
```

**0이 나와야 한다.**

- [ ] **Step 5: 로드맵 갱신**

`docs/roadmaps/ROADMAP_v1.md`의 "현재 상태" 블록을 다음으로 교체한다(날짜는 이 Task를 실제로 완료하는 날짜를 쓴다):

```markdown
- **진행 단계**: 정원 동시성 및 잔여 결함 정리 완료 — Phase 0~10 전체 완료
- **최종 업데이트**: <오늘 날짜 YYYY-MM-DD>
```

파일 맨 끝(Phase 9 블록 다음)에 다음을 추가한다:

```markdown
### Phase 10: 정원 동시성 및 잔여 결함 정리 ✅

> 동시 신청 시 정원을 초과해 등록되던 데이터 정합성 문제 수정,
> 직전 플랜에서 스코프 밖으로 남겨둔 결함 정리
> 상세 계획: `docs/superpowers/plans/2026-08-08-capacity-race-and-remaining-gaps.md`

- **Task 026: 정원 초과 등록 방지** ✅ - 완료
  - [x] 등록 후 순번 검증으로 동시 신청 시 정원 초과 차단

- **Task 027: 어드민 진입 경로 및 리소스 정리** ✅ - 완료
  - [x] 어드민 사이드바에 사용자 화면 이동 링크 추가
  - [x] 커버 이미지 교체/이벤트 삭제 시 Storage 고아 파일 정리

- **Task 028: 테스트 및 예외 처리 정리** ✅ - 완료
  - [x] `app.spec.ts` 더미 데이터 의존 테스트 10건 실데이터 기반 재작성
  - [x] 프로필 row 누락 시 인라인 안내로 전환
```

- [ ] **Step 6: 포맷 검증 및 커밋**

```bash
npm run format:check
git add docs/roadmaps/ROADMAP_v1.md
git commit -m "📝 docs: 로드맵 Phase 10 완료 처리"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- **재활성화 경로의 정원 동시성** — 취소했던 사람 여럿이 정확히 같은 순간에 "다시 참여하기"를 누르면 여전히 정원을 넘길 수 있다. Task 1은 신규 참여 경로만 방어한다. 재활성화는 이미 존재하는 행의 status만 바꾸는 것이라 "등록 후 순번 검증" 패턴을 그대로 적용할 수 없고(되돌릴 새 행이 없다), 별도 설계가 필요하다. 발생 확률이 신규 참여 경쟁보다 훨씬 낮아 미뤘다.
- **Storage 고아 파일 일괄 정리** — Task 3은 앞으로 생길 고아 파일을 막을 뿐, 지금까지 쌓인 것은 그대로 남는다. `storage.objects`와 `events.cover_image_url`을 대조해 지우는 일회성 정리 스크립트가 필요하다면 별도 작업으로 잡는다.
- **어드민 계정의 일반 사용자 기능 권한 범위** — Task 2는 진입 링크만 추가한다. 어드민이 일반 사용자로서 이벤트를 만들고 참여하는 것이 제품상 옳은지(예: 어드민 계정이 만든 이벤트가 통계에 섞이는 문제)는 제품 결정 사항이며 이 플랜에서 다루지 않는다.
- **검증용 잔여 데이터** — 직전 플랜과 이 플랜의 검증 과정에서 만들어진 이벤트/참여 레코드(`크로스디바이스 검증 이벤트`, `백필 검증 이벤트`, `정원경쟁 검증 이벤트`, `E2E 이벤트 *` 등)가 DB에 남는다. 정리가 필요하면 별도로 요청한다.
