# 참여자 명단 공개(회원/비회원 뱃지) — 설계 문서

**배경:** `docs/superpowers/backlog-notes.md`의 `#5`/`#6`(통합). 참여자 본인이 "함께 참여하는 사람들"을 볼 수 있게 하고, 회원/비회원 여부를 뱃지로 구분해서 보여준다.

## 스코프 결정 (브레인스토밍 확정)

- **공개 범위:** 이 이벤트에 `registered` 상태로 참여한 사람만(회원/비회원 무관). 로그인 여부나 링크 소지 여부만으로는 못 봄.
- **노출 위치:** `components/join-form.tsx`의 `"completed"` 상태 화면에 새 섹션으로 추가(별도 페이지 없음).
- **표시 정보:** 이름 + 회원/비회원 뱃지 + 아바타. 메모는 안 보여줌(주최자에게 남기는 말이라 다른 참여자가 볼 이유 없음). 참여 취소한 사람은 명단에서 제외.
- **아바타:** 회원은 `profiles.avatar_url` 있으면 그거, 없으면 기본 아이콘. 비회원은 항상 기본 아이콘. 새 이미지 에셋 없이 기존 lucide 아이콘 패턴 재사용.
- **실시간성:** 실시간 갱신 없음. 화면 진입/새로고침 시점 스냅샷.
- **`#3`(회원만 참가)과의 관계:** 별도 규칙 없음 — `#3`이 켜진 이벤트든 아니든, "이 이벤트의 registered 참여자"라는 동일한 규칙으로 명단이 보인다.

## 이번 설계 중 발견한 선재 이슈 (스코프 밖, 백로그에만 기록)

`participants` 테이블의 SELECT RLS 정책(`supabase/migrations/20260628000003_create_participants_table.sql`의 `"주최자 참여자 목록 조회"`)이 이름과 달리 `using (true)`로 **anon 포함 누구나 전체 참여자 행(메모, `guest_token` 포함)을 읽을 수 있게** 열려 있다. 이는 이번 기능이 만드는 문제가 아니라 기존부터 있던 문제이며, 이번 기능이 애플리케이션 레이어에서 아무리 접근 제어를 잘 만들어도 이 RLS 구멍을 통해 우회 조회가 가능하다는 한계가 있다. 다만 그 우회로 얻을 수 있는 정보(메모, guest_token)가 이번에 새로 노출하는 정보(이름, 회원여부, 아바타)보다 훨씬 민감해서, 이번 기능이 새로운 위험을 추가하는 것은 아니다.

**결정:** 이번 작업에서는 고치지 않는다. 백로그 `#11`(기존에 INSERT 구멍으로 기록된 항목)에 SELECT도 같은 상태라는 내용을 합쳐서 기록하고, RLS 종합 정비는 별도 작업으로 남긴다.

## 데이터 조회

스키마 변경 없음 — `participants.user_id !== null`이 이미 "회원"을 의미하므로 새 컬럼이 필요 없다.

`src/repositories/participant-repository.ts`에 추가:

```ts
export interface RosterEntry {
  name: string;
  isMember: boolean;
  avatarUrl: string | null;
}

export async function listRegisteredParticipantsForEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<RosterEntry[]>;
```

`status = 'registered'`인 행만, `user_id`가 있으면 `profiles(avatar_url)`을 조인해서 가져온다. `memo`, `guest_token` 등 민감 필드는 select 자체에 포함하지 않는다. 정렬은 `created_at` 오름차순(먼저 참여한 순 — 주최자 목록과 동일한 기준).

## 접근 제어 (서비스 레이어)

`src/services/participant-service.ts`에 추가:

```ts
export async function getEventParticipantRoster(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  userId: string | null,
  guestToken: string | null,
): Promise<RosterEntry[]>;
```

동작:

1. `shareToken`으로 이벤트를 조회한다. 없으면 `Error("유효하지 않은 참여 링크입니다.")`.
2. 본인이 이 이벤트의 `registered` 참여자인지 확인한다:
   - `userId`가 있으면 `getParticipantByEventAndUser(eventId, userId)`로 조회해 존재 + `status === "registered"`인지 확인.
   - 없으면 `guestToken`으로 `getParticipantByGuestToken(guestToken)`을 조회해, 존재 + 그 참여자의 `event_id`가 이 이벤트와 일치 + `status === "registered"`인지 확인.
   - 둘 다 실패하면 `Error("참여자만 볼 수 있습니다.")`를 던진다.
3. 통과하면 `listRegisteredParticipantsForEvent(eventId)`를 호출해 반환한다.

이 함수가 이번 기능의 유일한 보안 경계다 — UI가 아무리 조건부로 숨겨도, 이 서비스 함수를 거치지 않고는 명단을 가져올 방법이 없어야 한다(RLS 우회 경로는 위 "선재 이슈" 절 참고, 별도 트랙).

## 컨트롤러 (서버 액션)

`src/controllers/participant-controller.ts`에 추가:

```ts
export async function getEventParticipantsAction(
  shareToken: string,
  guestToken?: string,
): Promise<{ success: true; participants: RosterEntry[] } | { success: false }>;
```

세션에서 `userId`(없으면 `null`)를 읽어 서비스 함수를 호출한다. 이벤트 없음이든 인가 실패든 클라이언트에는 그냥 `{ success: false }`만 돌려준다 — 왜 실패했는지 이유를 클라이언트에 노출하지 않는다(기존 `getParticipantByGuestTokenAction`과 동일한 원칙).

## 클라이언트 UI

`components/join-form.tsx`:

- `participants` state(`RosterEntry[]`, 초기값 `[]`) 추가.
- `state === "completed"`가 될 때(로그인 사용자는 서버 렌더 시점부터, 비회원은 guestToken 검증 완료 후) `useEffect`로 `getEventParticipantsAction(shareToken, guestToken ?? undefined)`를 호출해 채운다. 이미 있는 `guestToken` state를 그대로 재사용한다.
- "완료" 화면에 새 섹션 "함께 참여하는 사람들" 추가. 각 행: 아바타 + 이름 + 뱃지.
  - **아바타:** `avatarUrl`이 있으면 `next/image`, 없으면 회색 원 배경 안에 lucide `User` 아이콘. 새 이미지 에셋 파일을 만들지 않고 기존 lucide 아이콘 패턴(`CalendarDays`/`MapPin`/`Users` 등 이미 쓰는 방식)을 그대로 따른다.
  - **뱃지:** 기존 shadcn `Badge` 컴포넌트 재사용(주최자 화면의 "참여"/"취소" 뱃지와 같은 컴포넌트). 회원은 은은한 파란색 계열 "회원", 비회원은 회색 계열 "비회원" — 기존 "참여"(초록)/"취소"(회색) 뱃지와 색이 겹치지 않게 해서 혼동을 막는다.
- 참여자가 자기 자신 하나뿐이면("나만 참여 중") 목록에 본인만 나오는 게 자연스러운 동작이라 별도 처리 불필요.

## 테스트

Playwright e2e 시나리오 3건 추가:

1. 비회원 A, 로그인 사용자 B가 순서대로 같은 이벤트에 참여 → A가 완료 화면을 다시 보면 명단에 본인("비회원")과 B("회원")가 이름과 함께 보이는지.
2. 아직 참여하지 않은 방문자(choice/form 상태)에게는 명단 섹션 자체가 없는지.
3. 참여를 취소한 사람은 명단에서 빠지는지.

서버 액션의 인가 체크(본인 확인 실패 시 거부)는 UI에 우회 진입점이 없어 e2e로 자연스럽게 재현하기 어려운 부분이라, `#3`(회원만 참가) 때와 동일하게 코드 리뷰로 확인하는 것으로 충분하다고 판단한다.

## 이번 스코프에서 다루지 않는 것

- `participants` SELECT RLS 종합 정비 — 백로그 `#11`에 합쳐서 기록(위 "선재 이슈" 절 참고).
- `#7`(이벤트 암호 보호), `#4`(날짜 범위 모임), `#8`(로그인 시 헤더 노출) — 백로그 노트 참고, 별도 브레인스토밍.
