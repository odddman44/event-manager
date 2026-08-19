# 이벤트 암호 보호 — 설계 문서

**배경:** `docs/superpowers/backlog-notes.md`의 `#7`. 주최자가 이벤트에 암호를 걸어, 암호를 아는 사람만 참여 페이지를 볼 수 있게 한다.

**이번 브레인스토밍에서 확정된 결정:**

- 암호를 틀리면 **이벤트 정보 자체(제목/날짜/장소 등)를 숨긴다** — 암호 입력 폼만 보여준다.
- `#3`(회원만 참가)과 **동시에 적용 가능**하다 — 별개의 체크박스 2개.
- 무차별 대입 방어(rate limiting)는 v1 스코프에서 제외한다(YAGNI — 토이 프로젝트 규모).
- 한 번 맞힌 브라우저는 다시 안 물어본다(재방문 시 재입력 불필요).
- `#9`(작성자 배너)가 이미 이 기능보다 먼저 동작하도록 설계돼 있다 — **작성자는 암호 게이트를 항상 건너뛴다.**

## 데이터 모델 — 별도 테이블로 분리

`participants` RLS 잠금 작업에서 겪은 문제(공개 SELECT 정책이 있는 테이블에 민감한 컬럼을 얹으면 그 컬럼도 같이 새어나간다)를 되풀이하지 않기 위해, 암호 해시를 `events` 테이블 컬럼으로 추가하지 않는다. `events`의 SELECT 정책은 `using (true)`로 완전 공개이기 때문이다.

- 새 테이블 `event_passwords`:
  ```sql
  create table public.event_passwords (
    event_id uuid primary key references public.events(id) on delete cascade,
    password_hash text not null,
    created_at timestamptz not null default now()
  );
  alter table public.event_passwords enable row level security;
  -- 정책을 하나도 만들지 않는다 — publishable key로는 SELECT/INSERT/UPDATE/DELETE 전부 불가.
  -- admin client(createAdminClient())로만 접근한다. participants 잠금과 동일한 패턴.
  ```
- `events` 테이블에는 `has_password boolean not null default false` 컬럼만 추가한다. 이건 참/거짓뿐이라 공개 SELECT로 노출돼도 무해하다 — 참여 페이지가 "암호 게이트를 보여줄지"만 판단하는 데 쓴다.
- `src/types/index.ts`의 `Event`에 `has_password: boolean` 추가. `password_hash`는 어떤 공유 타입에도 등장하지 않는다(Client Component에 절대 전달되지 않도록).

## 해시 — 새 의존성 없이 Node 내장 `crypto.scrypt` 사용

`src/lib/password-hash.ts` 신규 파일:

- `hashPassword(plain: string): string` — 랜덤 salt(16바이트) + `scryptSync` 결과를 `salt:hash` 형식의 hex 문자열로 반환.
- `verifyPasswordHash(plain: string, stored: string): boolean` — salt를 분리해 같은 방식으로 해시하고 `crypto.timingSafeEqual`로 비교(타이밍 공격 방지).

## 잠금 해제 쿠키

로그인 세션과 무관하게(비회원도 암호를 안다) "이 이벤트를 이미 열어봤다"를 브라우저에 기억시켜야 한다. 서버가 검증 없이 신뢰할 수 있는 서명된 쿠키를 쓴다.

`src/lib/event-unlock.ts` 신규 파일:

- `signUnlockToken(shareToken: string): string` — `HMAC-SHA256(shareToken, SUPABASE_SERVICE_ROLE_KEY)`의 hex 다이제스트. 이미 서버 전용 env var라 새 시크릿을 추가하지 않는다.
- `isValidUnlockToken(shareToken: string, token: string): boolean` — 서명을 재계산해 `crypto.timingSafeEqual`로 비교.

쿠키 이름: `moija_unlock_{shareToken}`, 값: `signUnlockToken(shareToken)`, `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `maxAge: 60 * 60 * 24 * 30`(30일).

## 서비스 레이어

`src/services/event-password-service.ts` 신규 파일:

- `setEventPassword(eventId, plainPassword)` — 해시해서 `event_passwords`에 upsert(admin client) + `events.has_password = true`(admin client).
- `clearEventPassword(eventId)` — `event_passwords`에서 delete(admin client) + `events.has_password = false`(admin client).
- `verifyEventPassword(shareToken, plainPassword): Promise<boolean>` — shareToken으로 이벤트 조회 → `event_passwords`에서 해당 event_id의 hash를 admin client로 조회 → `verifyPasswordHash`로 비교. 이벤트가 없거나 암호가 애초에 없으면 `false`.

`src/services/participant-service.ts`의 `getJoinPageData` 반환 타입을 판별 유니온으로 변경:

```ts
export type JoinPageData =
  | { locked: true }
  | {
      locked: false;
      event: Event;
      registeredCount: number;
      isFull: boolean;
      existingParticipant: {...} | null;
      isOrganizer: boolean;
    };
```

체크 순서(이벤트 조회 직후, 다른 로직보다 먼저):

1. `isOrganizer = userId != null && event.organizer_id === userId`
2. `isOrganizer`가 아니고 `event.has_password && !isUnlocked` → `{ locked: true }`만 반환(이벤트 필드 자체를 아예 담지 않는다 — 타입으로 강제).
3. 그 외에는 기존 로직(정원/기존참여/회원전용 등) 그대로 진행해 `locked: false` 형태로 반환.

`isUnlocked`는 새 파라미터로 받는다(쿠키 판독은 `app/join/[share_token]/page.tsx`가 `next/headers`의 `cookies()`로 하고, 결과만 boolean으로 넘긴다 — 서비스 레이어는 쿠키를 직접 다루지 않는다, 기존 `userId` 전달 관례와 동일).

## 컨트롤러 / 서버 액션

`src/controllers/participant-controller.ts`에 추가:

```ts
export async function verifyEventPasswordAction(
  shareToken: string,
  password: string,
): Promise<{ success: true } | { success: false; error: string }>;
```

검증 성공 시 `next/headers`의 `cookies()`로 위 쿠키를 설정하고 `{ success: true }` 반환. 실패 시 `{ success: false, error: "암호가 올바르지 않습니다." }`.

`src/lib/validations.ts`의 `createEventSchema`에 필드 추가:

```ts
password: z.string().max(72, "암호는 72자 이하여야 합니다").optional(),
remove_password: z.boolean().optional().default(false),
```

(72자 제한은 특별한 이유 없음 — 임의로 넉넉히 잡은 상한. 빈 문자열/미입력은 "변경 없음"으로 취급한다.)

`src/services/event-service.ts`의 `createEvent`/`updateEvent`가 이벤트 생성/수정 후 다음 규칙으로 `event-password-service`를 호출한다(이벤트 자체의 insert/update 트랜잭션과는 별개 — 실패해도 이벤트 생성/수정 자체를 롤백하지 않는다, 기존 `joinEvent`의 best-effort 정리 패턴과 유사한 수준으로 충분하다고 판단):

- 생성 시: `dto.password`가 비어있지 않으면 `setEventPassword`.
- 수정 시: `dto.remove_password`면 `clearEventPassword`. 아니면 `dto.password`가 비어있지 않을 때만 `setEventPassword`(비어있으면 기존 암호 유지, 아무 것도 안 함).

## 이벤트 생성/수정 폼 (`components/event-form.tsx`)

`members_only` 체크박스 아래에 필드 추가:

- 텍스트 입력 "이벤트 암호 (선택)" — `register("password")`, placeholder는 생성/수정에 따라 다르게: 생성 시 "비워두면 암호 없이 공개", 수정 시 "변경하려면 입력, 비워두면 기존 암호 유지".
- 수정 모드(`mode === "edit"`)이고 `defaultValues`로 현재 암호 보호 여부(`hasPassword: boolean`, 새 prop)를 받아 `true`일 때만: 체크박스 "암호 보호 해제" 노출, 체크 시 `remove_password: true`로 제출.

## 참여 페이지 (`/join/{share_token}`)

`app/join/[share_token]/page.tsx`:

- `cookies()`로 `moija_unlock_{share_token}` 값을 읽고 `isValidUnlockToken`으로 검증해 `isUnlocked: boolean` 계산, `getJoinPageData`에 전달.
- `data.locked === true`면 `JoinForm` 대신 새 컴포넌트 `<PasswordGate shareToken={share_token} />`를 렌더링한다. 로그인 상태 헤더(`#8`)는 이 경우에도 그대로 보여준다(로그인은 했지만 암호는 모르는 회원도 있을 수 있으므로).

`components/password-gate.tsx` 신규 파일(작은 클라이언트 컴포넌트):

- 암호 입력 필드 + "확인" 버튼. `verifyEventPasswordAction(shareToken, password)` 호출.
- 성공 시 `router.refresh()`(서버 컴포넌트를 다시 실행시켜 쿠키가 반영된 `getJoinPageData` 결과로 리렌더 — 페이지 전체 리로드 없이 App Router의 표준 방법).
- 실패 시 에러 메시지 표시.
- 이벤트 정보(제목 등)는 이 컴포넌트에 애초에 전달되지 않는다 — props가 `shareToken`뿐이라 실수로라도 노출할 방법이 없다.

## `#9`(작성자 배너)와의 상호작용

`getJoinPageData`가 `isOrganizer`를 암호 체크보다 먼저 계산하므로, 작성자는 암호가 걸린 자기 이벤트를 열어도 `locked: false` + 배너가 함께 온다 — 백로그 `#9` 노트에 남겼던 우려("암호 걸린 자기 모임 링크를 열었는데 본인이 암호 입력해야 하면 이상함")를 자연스럽게 해소한다.

## 테스트

Playwright e2e 시나리오(기존 스위트에 이어붙임):

1. 암호 설정된 이벤트를 비로그인/틀린 암호로 열면 이벤트 정보(제목)가 전혀 안 보이고 암호 입력 폼만 보인다.
2. 올바른 암호 입력 → 이벤트 정보와 참여 폼이 보인다.
3. 같은 브라우저로 재방문(새 페이지 로드) 시 암호를 다시 안 물어본다(쿠키로 기억).
4. 암호 없는 이벤트(`has_password=false`, 기본값)는 기존처럼 곧바로 정보가 보인다(회귀 방지).
5. 작성자가 자기 암호 걸린 이벤트를 열면 암호 없이 바로 정보 + `#9` 배너가 보인다.
6. `event_passwords` 테이블에 대한 직접 REST 접근이 거부되는지(`participants` RLS 잠금 때와 동일한 패턴의 보안 회귀 테스트) — 비로그인 상태로 `GET /rest/v1/event_passwords`가 빈 배열을, `POST`가 4xx를 반환하는지 확인.

## 이번 스코프에서 다루지 않는 것

- 무차별 대입 방어(rate limiting, 시도 횟수 제한) — v1에서 의도적으로 제외.
- `#4`(날짜 범위), `#8`/`#9`(이미 별도로 구현 완료) — 관련 없음.
