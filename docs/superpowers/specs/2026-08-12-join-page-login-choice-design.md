# 참여 페이지 로그인/비회원 선택 흐름 설계

## 배경

참여 링크(`/join/{token}`)를 열면 로그인 여부와 무관하게 항상 비회원용 이름/메모 입력 폼이 바로 뜬다. 실제로는 로그인 상태에서 그 폼을 채워 제출하면 서버가 세션을 감지해 참여를 계정에 연결하지만(크로스 디바이스 재인식), 화면에는 그 사실이 전혀 드러나지 않는다. 더 큰 문제는 **비로그인 상태에서 로그인부터 하고 참여하고 싶어도 그럴 방법이 화면에 없다**는 것 — 로그인 페이지로 직접 이동한 뒤 다시 원래 참여 링크를 찾아 들어와야 한다.

## 범위

- 비로그인 방문자에게 "비회원으로 계속하기 / 로그인하고 참여하기" 선택 화면을 먼저 보여준다.
- "로그인하고 참여하기"는 기존 `/auth/login` 페이지(구글 로그인 포함)로 보내고, 로그인 성공 후 원래 참여 링크로 자동으로 돌아온다.
- 이미 로그인된 상태(이 이벤트에 아직 참여 안 함)라면 선택 화면 없이 바로 참여 폼을 보여주되, 이름 필드는 프로필 이름으로 자동 채워진다(수정 가능).
- 정원 초과, 이미 참여함(재방문 인식) 등 기존 상태 분기는 그대로 유지한다 — 이 작업은 "form" 상태 진입 직전 단계에만 개입한다.
- 비회원(guest) 참여 자체를 없애거나 이벤트별 회원 전용 옵션을 추가하는 것은 이번 스코프 밖(별도 작업으로 진행 예정).

## 흐름

```
GET /join/{token}
├─ 이미 참여함(재방문 인식) → 기존과 동일(완료/취소 상태)
├─ 정원 초과 → 기존과 동일(full 상태)
├─ 로그인 상태 → "form" 상태, 이름 자동입력(프로필 full_name)
└─ 비로그인 상태 → "choice" 상태(신규)
     ├─ "비회원으로 계속하기" 클릭 → "form" 상태(기존과 동일, 이름 직접 입력)
     └─ "로그인하고 참여하기" 클릭 → /auth/login?redirect=/join/{token}
          └─ 로그인 성공(이메일 또는 구글) → /join/{token}으로 복귀 → 위 "로그인 상태" 분기 재평가
```

## 컴포넌트/서버 변경

**`app/join/[share_token]/page.tsx`**

- 로그인 상태(`userId` 존재)면 `profiles.full_name`도 함께 조회해 `JoinForm`에 `isLoggedIn`, `loggedInName` prop으로 전달한다. `full_name`이 `null`이면(프로필에 이름 미입력) 빈 문자열로 변환해서 넘긴다 — `loggedInName` prop 타입은 `string`으로 고정, `string | null`을 그대로 넘기지 않는다.

**`components/join-form.tsx`**

- `PageState`에 `"choice"` 추가.
- 신규 props: `isLoggedIn: boolean`, `loggedInName: string`.
- 초기 상태 계산: `existingParticipant` 있으면 기존 로직 그대로 → 없고 `isFull`이면 `"full"` → 없고 `isLoggedIn`이면 `"form"`(이름 필드 초기값을 `loggedInName`으로) → 그 외(비로그인)면 `"choice"`.
- `"choice"` 상태 UI: 이벤트 정보 카드 아래, "로그인하고 참여하기"(primary 버튼, `/auth/login?redirect=` + 현재 `/join/{shareToken}` 경로로 이동) / "비회원으로 계속하기"(outline 버튼, 로컬 상태만 `"form"`으로 전환) 두 버튼.

**`app/auth/login/page.tsx`**

- `searchParams`에서 `redirect` 값을 읽어 `LoginForm`에 `redirectTo` prop으로 전달.

**`components/login-form.tsx`**

- `redirectTo?: string` prop 추가.
- 이메일/비밀번호 로그인 성공 시: `redirectTo`가 유효한 상대 경로면(아래 보안 규칙) 그리로 `router.push`, 아니면 기존처럼 역할 기반(`/admin`/`/dashboard`)으로.
- `<GoogleLoginButton redirectTo={redirectTo} />`로 그대로 전달.

**`components/google-login-button.tsx`**

- `redirectTo?: string` prop 추가.
- `signInWithOAuth`의 `options.redirectTo`를 `${window.location.origin}/auth/callback${redirectTo ? "?next=" + encodeURIComponent(redirectTo) : ""}`로 구성.

**`app/auth/callback/route.ts`**

- `next` 쿼리 파라미터를 읽어 유효한 상대 경로면(아래 보안 규칙) 그리로 `redirect`, 아니면 기존처럼 역할 기반 리다이렉트.

## 보안: 오픈 리다이렉트 방지

`redirect`/`next` 파라미터 값을 검증 없이 리다이렉트에 그대로 쓰면 `?redirect=https://evil.com` 같은 외부 사이트로의 피싱 벡터가 된다. 두 지점(`login-form.tsx`, `auth/callback/route.ts`) 모두 다음 검증 함수를 통과한 값만 사용한다:

```ts
// "/"로 시작하고 "//"로는 시작하지 않는 같은 오리진 상대 경로만 허용한다.
// "//evil.com"은 브라우저가 프로토콜 상대 URL로 해석해 외부로 나갈 수 있어 별도로 막는다.
function isSafeRedirect(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}
```

## 에러 처리

- `redirect`/`next` 값이 안전하지 않으면 조용히 기존 기본 동작으로 폴백한다(에러를 보여주지 않는다 — 사용자가 링크를 조작했을 가능성이 높고, 정상 사용자에게는 어차피 발생하지 않는 경로다).
- 로그인 자체가 실패하면(잘못된 비밀번호 등) 기존 에러 메시지 표시 로직을 그대로 따른다 — `redirectTo`는 로그인 성공 이후에만 관여한다.

## 테스트 계획 (Playwright MCP 수동 검증)

1. 비로그인으로 참여 링크 접속 → "choice" 화면(버튼 2개) 확인
2. "비회원으로 계속하기" 클릭 → 기존과 동일한 이름/메모 폼 확인, 제출까지 정상 동작(회귀)
3. "로그인하고 참여하기" 클릭 → `/auth/login?redirect=/join/{token}`으로 이동 확인
4. 그 화면에서 이메일 로그인 → 원래 참여 링크로 자동 복귀 확인 → 이름 필드에 프로필 이름 자동입력 확인 → 참여 제출 → DB에서 해당 participant 행에 `user_id`가 채워졌는지 확인
5. 다른 브라우저 컨텍스트(같은 계정)로 같은 링크 재방문 → 즉시 "완료" 상태로 인식되는지 확인(크로스 디바이스 회귀)
6. `/join/{token}?무관`에 `/auth/login?redirect=https://evil.com`을 직접 접속해 로그인 → `/dashboard`(또는 `/admin`)로 안전하게 폴백되는지 확인(오픈 리다이렉트 방지 확인)
7. 정원 초과 이벤트는 로그인 여부와 무관하게 "full" 상태가 우선되는지 확인(회귀)
8. 이미 참여한 이벤트는 로그인 여부와 무관하게 "choice" 화면을 건너뛰고 바로 완료 상태로 인식되는지 확인(회귀)

## 이번 스코프에서 다루지 않는 것

- 이벤트별 "회원만 참가" 옵션 (다음 작업으로 예정)
- 참여자 목록을 비회원/회원에게 공개하는 기능 (백로그, 이 작업 이후 진행 예정)
- 이벤트 암호 보호 기능 (백로그, 별도 작업으로 진행 예정)
- 앱 전체를 회원제로 전환하는 것 (검토했으나 채택하지 않음 — 이벤트별 옵션으로 대체)
