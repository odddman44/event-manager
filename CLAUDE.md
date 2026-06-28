# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Next.js(App Router) + Supabase 기반 인증 스타터킷에서 출발한 프로젝트. `src/` 디렉토리 없이 `app/`, `components/`, `lib/`이 저장소 루트에 직접 위치한다. 자체 데이터 모델(`profiles` 테이블)을 Supabase 마이그레이션으로 확장하기 시작한 상태.

- **Next.js 16.2.9** (App Router, `cacheComponents: true`)
- **React 19.2.7**, TypeScript 5.9.3
- **Tailwind CSS 3.4.19** + `tailwindcss-animate` + shadcn/ui (`new-york` style, `neutral` base color)
- **@supabase/ssr 0.12.0** + **@supabase/supabase-js 2.108.2** (쿠키 기반 SSR 인증)
- `react-hook-form`/`zod`는 설치되어 있지 않음 — 폼은 `useState` + Supabase SDK 직접 호출 패턴 사용

## 명령어

```bash
npm run dev           # 개발 서버 (Turbopack)
npm run build         # 프로덕션 빌드
npm run start         # 빌드 결과 실행
npm run lint          # ESLint (flat config: eslint-config-next/core-web-vitals, /typescript, eslint-config-prettier)
npm run typecheck     # 타입 체크 (tsc --noEmit)
npm run format        # Prettier 포맷 적용 (prettier-plugin-tailwindcss로 className도 정렬)
npm run format:check  # Prettier 포맷 검사만 (CI/pre-commit용)
npm run knip          # 미사용 파일/export/의존성 탐지 (수동 실행, 자동 강제 아님)
```

테스트 프레임워크(Jest/Vitest/Playwright 등)는 설치되어 있지 않다. 테스트 실행/단일 테스트 명령은 존재하지 않는다.

## 개발 도구 체인

- **ESLint**: `eslint-config-next`는 `next` 버전과 동일하게 고정(`^16.2.9`). `eslint.config.mjs`는 `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`를 네이티브 flat config로 직접 import한다 — `@eslint/eslintrc`의 `FlatCompat`로 감싸면 `eslint-config-next@16.x`에서 순환 참조 에러(`Converting circular structure to JSON`)가 발생하므로 사용하지 않는다. 마지막에 `eslint-config-prettier`를 추가해 포맷 규칙 충돌을 막는다.
- **Prettier**: `.prettierrc`에 명시적 설정(기존 코드 스타일과 동일한 더블쿼트/세미콜론/trailing comma) + `prettier-plugin-tailwindcss`로 className 자동 정렬.
- **Git Hooks (Husky v9)**: `.husky/pre-commit`이 `lint-staged`를 실행해 staged 파일만 `eslint --fix` + `prettier --write` 적용. `.husky/pre-push`가 `npm run typecheck`를 실행해 타입 에러가 있는 커밋이 원격으로 push되는 것을 막는다. `git commit --no-verify`/`git push --no-verify`로 우회 가능(의도된 비상 탈출구).
- **knip**: 미사용 파일/export/의존성 탐지용. shadcn/ui 컴포넌트의 variant export나 Supabase 생성 타입(`Json`, `Tables` 등)은 정상적으로 "미사용"으로 잡히는 오탐이므로, 결과를 그대로 자동 삭제하지 말고 사람이 판단한다.
- **CI (`.github/workflows/ci.yml`)**: push/PR마다 `lint` → `typecheck` → `build` 실행. `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 GitHub repo Secrets에 등록해야 build 단계가 통과한다(등록은 사용자가 직접 수행).
- **`.nvmrc`**: `22` (로컬 개발 환경과 CI가 동일 Node 버전 사용).

## 아키텍처

### 인증 흐름 (쿠키 기반 SSR)

세 곳에서 각각 다른 Supabase 클라이언트를 만든다 — 절대 공유하지 말고 매 요청/렌더마다 새로 생성한다.

- `lib/supabase/client.ts` — `createBrowserClient<Database>()`. Client Component에서 사용.
- `lib/supabase/server.ts` — `createServerClient<Database>()`. `next/headers`의 `cookies()`로 세션을 읽고 쓴다. Server Component/Route Handler에서 사용.
- `lib/supabase/proxy.ts`의 `updateSession()` — 저장소 루트 `proxy.ts`(Next.js 16에서 `middleware.ts`를 대체하는 파일명, export 함수명도 `proxy`)가 매 요청마다 호출한다. `auth.getClaims()`로 세션을 갱신하고, 미인증 사용자가 보호된 경로에 접근하면 `/auth/login`으로 리다이렉트한다. `supabaseResponse` 쿠키를 그대로 반환해야 하며, 임의로 다른 응답 객체로 교체하면 세션이 끊긴다.

로그인/회원가입/비밀번호 관련 폼(`components/login-form.tsx`, `sign-up-form.tsx`, `forgot-password-form.tsx`, `update-password-form.tsx`)은 Server Action이 아니라 **Client Component + `useState` + `supabase.auth.*()` 직접 호출** 패턴이다. 새 폼을 추가할 때 이 패턴과 일치시킬지, `docs/guides/forms-react-hook-form.md`의 RHF+Zod 패턴(아직 미도입)을 새로 도입할지 먼저 결정한다.

### 데이터베이스 스키마

`supabase/migrations/`에 마이그레이션이 순서대로 쌓인다:

1. `profiles` 테이블 생성 — `auth.users`와 1:1(`id`가 FK), RLS 활성화, 본인 행만 select/update 가능한 정책.
2. `handle_new_user()` 트리거가 `auth.users` insert 시 `profiles` 행을 자동 생성. `handle_updated_at()` 트리거가 `updated_at`을 자동 갱신.
3. 후속 마이그레이션에서 RLS 정책을 `(select auth.uid())`로 최적화하고, `handle_new_user()`의 `EXECUTE` 권한을 `anon`/`authenticated`/`public`에서 회수(트리거 전용으로만 호출되도록 제한).

`lib/supabase/database.types.ts`는 이 스키마로부터 생성된 타입이며 `createBrowserClient<Database>`/`createServerClient<Database>` 양쪽에 제네릭으로 주입된다. 스키마를 바꾼 뒤에는 Supabase MCP(`generate_typescript_types`)나 Supabase CLI로 이 파일을 재생성해야 한다.

### 캐싱 모델 (Next.js 16 Cache Components)

`next.config.ts`에 `cacheComponents: true`가 설정되어 있다. 이는 기존 `ppr`/`useCache`/`dynamicIO` 플래그를 통합한 모델로, 정적으로 캐시하고 싶은 데이터 접근에는 `'use cache'` 디렉티브 + `cacheLife()`/`cacheTag()`를 명시해야 하며, 캐시되지 않은 동적 접근(`cookies()`, `headers()`, 캐시 안 된 `fetch`)은 자동으로 해당 요청을 동적으로 만든다. 자세한 사용법은 `docs/guides/nextjs-16.md` 참고.

### 컴포넌트 구성

- `components/ui/*` — shadcn/ui 컴포넌트. `npx shadcn@latest add <name>`으로 추가.
- `components/tutorial/*` — 스타터킷이 제공하는 온보딩 안내용 컴포넌트. 실제 앱 기능과 무관하므로 제품 기능을 만들 때는 참고만 한다.
- 그 외 `components/` 루트의 컴포넌트(`auth-button.tsx`, `theme-switcher.tsx` 등)는 카테고리 폴더 없이 평평하게 위치 — 같은 종류 파일이 여러 개 모이기 전까지는 하위 폴더를 새로 만들지 않는다.

### 개발 가이드 문서

`docs/guides/`에 이 코드베이스 기준으로 맞춰진 가이드 5개가 있다. 관련 작업 전에 먼저 확인한다.

- `project-structure.md` — 폴더 구조, 네이밍, 경로 별칭(`@/*` → 저장소 루트)
- `component-patterns.md` — Server/Client Component 경계, props 설계, 성능 패턴
- `nextjs-16.md` — App Router, Cache Components, proxy.ts 컨벤션
- `styling-guide.md` — Tailwind/shadcn 스타일링 규칙, CSS 변수
- `forms-react-hook-form.md` — RHF+Zod 패턴 가이드 (아직 미도입, 도입 시 참고용)

### MCP 연동

`.mcp.json`(gitignore됨)에 Supabase, context7, playwright, sequential-thinking, shadcn MCP 서버가 구성되어 있다. 스키마 조회나 마이그레이션 작업은 직접 SQL을 추측하기보다 Supabase MCP 도구(`list_tables`, `apply_migration`, `generate_typescript_types`, `get_advisors` 등)를 우선 사용한다.

## 환경 변수

- `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key 모두 호환). Next.js 앱이 사용.
- `.claude/.env` — `SLACK_WEBHOOK_URL`. 앱 런타임과 무관하며 `.claude/hooks/notify-slack.sh`가 Claude Code 알림(Notification/PermissionRequest/Stop)을 Slack으로 보낼 때만 사용한다. `.claude/` 전체가 gitignore 대상이라 별도 처리 불필요.
