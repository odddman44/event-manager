# 이벤트별 "회원만 참가" 옵션 — 설계 문서

**배경:** `docs/superpowers/backlog-notes.md`의 `#3`. 주최자가 이벤트별로 "회원만 참가 가능"을 켤 수 있게 한다. 앱 전체를 회원제로 바꾸는 게 아니라(비회원 참여 인프라는 그대로 유지), 이벤트마다 선택할 수 있는 옵션으로 둔다.

**이번 브레인스토밍에서 함께 다룬 두 항목의 처리 결과(둘 다 코드 변경 없음):**

- **`#9` 모임 작성자가 자기 참여 링크를 열었을 때 작성자 화면으로 안내할지** → **하지 않기로 결정.** 현재처럼 일반 참여자와 동일하게 취급한다. 이 결정 덕분에 "회원만" 체크가 작성자에게도 예외 없이 동일하게 적용된다(작성자는 항상 로그인 상태이므로 걸릴 일이 없다).
- **`#10` 참여자 이름을 프로필 이름이 아닌 닉네임으로 자유롭게 쓸 수 있게 할지** → **이미 해결된 것으로 확인.** `#1`에서 만든 이름 입력란은 프로필 이름으로 미리 채워질 뿐 자유롭게 수정 가능한 일반 텍스트 필드라, 추가 작업이 필요 없다.

## 데이터 모델

- `events` 테이블에 컬럼 추가: `members_only boolean not null default false`.
- `src/types/index.ts`의 `Event` interface에 `members_only: boolean` 추가.
- `CreateEventDto` / `UpdateEventDto`(`src/repositories/event-repository.ts` 주변에서 사용 중인 타입)와 `createEventSchema`(`src/lib/validations.ts`, zod)에 `members_only: boolean` 추가. 체크 안 한 상태가 기본값이므로 zod 스키마는 `.default(false)`로 항상 값이 채워지게 한다.
- 마이그레이션 적용 후 `mcp__supabase__generate_typescript_types`로 `lib/supabase/database.types.ts`를 재생성해야 `events` 테이블 타입에 `members_only`가 반영된다(이 프로젝트의 기존 마이그레이션 작업 방식).

## 이벤트 생성/수정 폼

- `components/event-form.tsx`에 체크박스 하나 추가. 라벨: "회원만 참가 가능". 위치: "최대 참여자 수" 필드 아래.
- 이미 프로젝트에 설치돼 있지만 아직 쓰인 적 없는 shadcn `Checkbox`(`components/ui/checkbox.tsx`)를 사용한다. react-hook-form의 `register()`는 네이티브 체크박스 전제라 Radix 기반 컴포넌트와 안 맞으므로, `Controller`로 연결한다.
- 생성 폼과 수정 폼 양쪽에 동일하게 노출되고, 언제든 토글 가능하다(생성 후 수정 폼에서 켜고 끌 수 있음).
- 이미 비회원으로 참여해 있던 사람이 있는 상태에서 주최자가 이 옵션을 나중에 켜도, 기존 참여자는 그대로 유지된다(소급 적용 없음, 강제 제거나 경고 표시 없음). 새로 들어오는 비회원만 막힌다.

## 참여 페이지(`/join/{share_token}`) 동작

- `getJoinPageData`(`src/services/participant-service.ts`)가 반환하는 `event` 객체에 이미 `members_only`가 포함되므로 별도 조회 로직 추가는 불필요 — `app/join/[share_token]/page.tsx`가 이 값을 `JoinForm`에 `membersOnly: boolean` prop으로 넘기기만 하면 된다.
- `components/join-form.tsx`의 `"choice"` 상태(비로그인 방문자에게 보이는 "참여 방법 선택" 화면):
  - `membersOnly && !isLoggedIn`이면 "비회원으로 계속하기" 버튼을 렌더링하지 않고, 그 자리에 안내 문구("이 모임은 회원만 참여할 수 있어요")를 넣는다. "로그인하고 참여하기" 버튼은 그대로 유지.
  - `membersOnly`가 `false`(기본값)면 기존과 완전히 동일 — 회귀 없음.
- 초기 상태 계산 로직(`existingParticipant` → `isFull` → `isLoggedIn`) 자체는 바꾸지 않는다. 정원 마감이 회원제 여부보다 항상 우선한다(기존 순서 유지) — "회원만"이면서 동시에 정원 마감인 이벤트는 여전히 "정원 마감" 화면이 보인다.
- 이미 참여해 있던 비회원(위 데이터 모델 절 참고)은 `existingParticipant`로 여전히 인식되어 choice 화면 자체를 건너뛰고 바로 "완료" 상태로 간다 — `members_only` 체크는 **신규 참여 시도**에만 관여한다.

## 서버 방어

`src/services/participant-service.ts`의 `joinEvent` 함수에서, `getEventByShareTokenRepository` 호출 직후(이벤트 존재 여부 확인 바로 다음) 아래 체크를 추가한다:

```ts
if (event.members_only && !userId) {
  throw new Error("이 이벤트는 회원만 참여할 수 있습니다.");
}
```

UI에서 버튼을 숨겨도 참여 서버 액션(`joinEventAction`)을 직접 호출하면 우회할 수 있으므로 반드시 필요한 방어선이다. 이미 발급된 `guestToken` 기반의 메모 수정/취소/재활성화(`updateParticipantMemo`, `cancelParticipation`, `reactivateParticipation`)는 신규 참여가 아니므로 이 체크의 영향을 받지 않는다.

## 테스트

Playwright e2e 시나리오 3건 추가(기존 스위트에 이어붙임):

1. `members_only=true` 이벤트를 로그아웃 상태로 열면, choice 화면에 "로그인하고 참여하기" 버튼만 있고 안내 문구가 보이는지.
2. `members_only=false`(기본값) 이벤트는 기존처럼 버튼 2개 다 보이는지(회귀).
3. 로그인 상태로 `members_only=true` 이벤트를 열면 choice 화면 없이 기존처럼 바로 참여 폼으로 가는지(회귀).

서버 방어(`joinEvent`의 `members_only` 체크)는 UI에 우회 진입점이 없어 e2e로 자연스럽게 재현하기 어려운 부분이라, `#1` 플랜의 구글 OAuth 콜백 경로 때와 동일하게 **코드 리뷰로 확인**하는 것으로 충분하다고 판단한다. 이 스코프는 `#1`보다 훨씬 작아 별도 unit 테스트 러너 도입은 고려하지 않는다.

## 이번 스코프에서 다루지 않는 것

- `#5`/`#6`(참여자 목록 공개), `#7`(이벤트 암호 보호), `#4`(날짜 범위 모임), `#8`(로그인 시 헤더 노출) — 백로그 노트의 다음 순서대로 별도 브레인스토밍.
- `#9`(작성자 자기 링크 감지), `#10`(닉네임 참여) — 위에서 설명한 대로 이번 브레인스토밍에서 "변경 불필요"로 결론 내림.
