# Phase 3: 인증 + 접근 제어 설계

**날짜**: 2026-07-01  
**범위**: Task 005 (회원가입/로그인/로그아웃) + Task 006 (접근 제어 미들웨어)  
**결정 사항**: role 확인은 미들웨어에서 profiles DB 쿼리로 처리 (JWT claim 미사용)

---

## 1. 인증 흐름

### 일반 로그인 (`/auth/login`)

1. `supabase.auth.signInWithPassword(email, password)`
2. 성공 시 `profiles` 테이블에서 `role` 조회 (`select('role').eq('id', user.id)`)
3. `role === 'admin'` → `/admin` 리다이렉트, 그 외 → `/dashboard` 리다이렉트
4. 실패 시 에러 메시지 표시

### 어드민 로그인 (`/admin/login`)

1. `supabase.auth.signInWithPassword(email, password)`
2. 성공 시 `profiles` 테이블에서 `role` 조회
3. `role === 'admin'` → `/admin` 리다이렉트
4. `role !== 'admin'` → `supabase.auth.signOut()` 후 에러 메시지 표시 ("관리자 권한이 없습니다")
5. 로그인 자체 실패 시 에러 메시지 표시

### 회원가입 (`/auth/sign-up`)

1. `supabase.auth.signUp(email, password, { data: { full_name }, emailRedirectTo: /auth/callback })`
2. 성공 시 `/auth/sign-up-success` (이메일 인증 안내)
3. Supabase 트리거로 `profiles` 자동 생성 (`role` 기본값 `'user'`)

### 이메일 인증 콜백 (`/auth/callback`)

1. `supabase.auth.exchangeCodeForSession(code)`
2. 성공 시 `profiles` 테이블에서 `role` 조회
3. `role === 'admin'` → `/admin`, 그 외 → `/dashboard`
4. 실패 시 `/auth/error`

### 로그아웃

- 일반/어드민 공통: `supabase.auth.signOut()` → `/` (랜딩 페이지) 리다이렉트

---

## 2. 접근 제어 미들웨어

### 경로 분류

| 경로                           | 접근 조건                                      |
| ------------------------------ | ---------------------------------------------- |
| `/`                            | 공개                                           |
| `/auth/login`, `/auth/sign-up` | 비로그인 전용 (로그인 상태면 `/dashboard`)     |
| `/auth/*` (그 외)              | 공개 (`/auth/callback`, `/auth/error` 등)      |
| `/join/*`                      | 공개 (비회원 참여자)                           |
| `/admin/login`                 | 비로그인 전용 (로그인 상태면 role에 따라 분기) |
| `/dashboard/*`, `/events/*`    | 로그인 필요 (비로그인 → `/auth/login`)         |
| `/admin/*` (login 제외)        | 로그인 + admin role 필요                       |

### 미들웨어 처리 순서

```
1. updateSession() 호출 → 세션 쿠키 갱신 (필수)
2. getClaims() → user 여부 확인
3. 비로그인 전용 페이지 (/auth/login, /auth/sign-up, /admin/login) + 로그인 상태
   → 로그인된 경우 role 조회 → admin은 /admin, user는 /dashboard 리다이렉트
4. 유저 전용 경로 (/dashboard/*, /events/*) + 비로그인
   → /auth/login 리다이렉트 (returnUrl 쿼리 파라미터 없음)
5. 어드민 경로 (/admin/*) + 비로그인
   → /admin/login 리다이렉트
6. 어드민 경로 (/admin/*) + 로그인
   → profiles DB 쿼리 (role 확인)
   → role !== 'admin' → /dashboard 리다이렉트
7. 그 외 → 통과
```

### matcher 설정

```ts
// /auth/callback, /join/*, / 는 미들웨어 통과 (세션 갱신 불필요)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

## 3. 변경 파일 목록

| 파일                                 | 유형 | 변경 내용                                        |
| ------------------------------------ | ---- | ------------------------------------------------ |
| `middleware.ts`                      | 신규 | 세션 갱신 + 접근 제어 로직 전체                  |
| `components/login-form.tsx`          | 수정 | role 조회 후 분기 리다이렉트                     |
| `components/sign-up-form.tsx`        | 수정 | `emailRedirectTo` → `/auth/callback`             |
| `app/auth/callback/route.ts`         | 수정 | role 조회 후 `/admin` or `/dashboard` 리다이렉트 |
| `app/admin/login/page.tsx`           | 수정 | 실제 Supabase Auth 연동 + role 검증 + 에러 처리  |
| `components/logout-button.tsx`       | 수정 | 리다이렉트 대상 `/` 로 변경                      |
| `components/admin-logout-button.tsx` | 수정 | 리다이렉트 대상 `/` 로 변경                      |

**변경 없음**: DB 스키마, RLS 정책, Supabase 클라이언트 (`lib/supabase/`)

---

## 4. 테스트 시나리오 (Playwright MCP)

### Task 005

- 회원가입 → 이메일 인증 → `/dashboard` 이동 플로우
- 로그인 성공 (user → `/dashboard`, admin → `/admin`)
- 로그인 실패 (잘못된 비밀번호, 미가입 계정) → 에러 메시지 표시
- 로그아웃 → `/` 이동 → 보호 경로 접근 차단

### Task 006

- user 계정으로 `/admin` 접근 → `/dashboard` 리다이렉트
- 비로그인 상태로 `/dashboard` 접근 → `/auth/login` 리다이렉트
- 비로그인 상태로 `/admin` 접근 → `/admin/login` 리다이렉트
- 로그인 상태로 `/auth/login` 접근 → role 기반 리다이렉트

---

## 5. 범위 외 (Phase 3에서 구현 안 함)

- Google OAuth 연동 (어드민 로그인 페이지의 Google 버튼 유지, 더미)
- 비밀번호 재설정 플로우
- 세션 만료 처리 (미들웨어의 `updateSession`이 자동 갱신)
