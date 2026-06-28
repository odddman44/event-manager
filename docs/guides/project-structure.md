# 프로젝트 구조 가이드

이 문서는 이 Next.js 16 + Supabase 프로젝트의 폴더 구조, 파일 조직 및 네이밍 컨벤션을 정의합니다.

## 🏗️ 전체 프로젝트 구조

> ⚠️ 이 프로젝트는 `src/` 디렉토리를 사용하지 않습니다. `app/`, `components/`, `lib/`은 모두 저장소 루트에 위치합니다.

```
nextjs-supabase-app/
├── app/                    # 🚀 Next.js App Router
├── components/             # 🧩 React 컴포넌트
├── lib/                    # 🛠️ 유틸리티 및 Supabase 클라이언트
├── docs/                   # 📚 프로젝트 문서
│   └── guides/            # 개발 가이드 모음
├── supabase/               # 🗄️ Supabase 마이그레이션
│   └── migrations/
├── proxy.ts                 # 🔐 인증 세션 갱신 (구 middleware.ts)
├── components.json         # shadcn/ui 설정
├── next.config.ts          # Next.js 설정
├── tailwind.config.ts      # TailwindCSS 설정
├── package.json            # 의존성 및 스크립트
└── tsconfig.json           # TypeScript 설정
```

## 📁 세부 폴더 구조 (실제 현황)

### app/ - App Router 페이지

```
app/
├── layout.tsx              # 🎨 루트 레이아웃 (ThemeProvider 설정)
├── page.tsx                # 🏠 홈페이지 (/)
├── globals.css             # 🎨 전역 CSS + Tailwind 디렉티브 + CSS 변수
├── favicon.ico
├── auth/                   # 🔐 인증 관련 페이지
│   ├── login/page.tsx
│   ├── sign-up/page.tsx
│   ├── sign-up-success/page.tsx
│   ├── forgot-password/page.tsx
│   ├── update-password/page.tsx
│   ├── error/page.tsx
│   └── confirm/route.ts    # 이메일 confirm 콜백 Route Handler
└── protected/               # 🔒 로그인 필요 페이지
    ├── layout.tsx
    └── page.tsx
```

**🚀 App Router 규칙:**

- `page.tsx`: 해당 경로의 메인 페이지
- `layout.tsx`: 레이아웃 컴포넌트 (자식 페이지 감쌈)
- `route.ts`: Route Handler (예: `app/auth/confirm/route.ts`)
- `loading.tsx` / `error.tsx` / `not-found.tsx`: 필요한 경로에 추가

### components/ - 컴포넌트 조직

```
components/
├── ui/                     # 🎛️ shadcn/ui 기본 컴포넌트
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── checkbox.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   └── label.tsx
├── tutorial/                # 📖 스타터킷 튜토리얼 전용 컴포넌트
│   ├── code-block.tsx
│   ├── connect-supabase-steps.tsx
│   ├── fetch-data-steps.tsx
│   ├── sign-up-user-steps.tsx
│   └── tutorial-step.tsx
├── login-form.tsx           # 🔐 로그인 폼 (Client Component)
├── sign-up-form.tsx         # ✍️ 회원가입 폼 (Client Component)
├── forgot-password-form.tsx
├── update-password-form.tsx
├── auth-button.tsx          # 로그인 상태에 따른 헤더 버튼 (Server Component)
├── logout-button.tsx
├── theme-switcher.tsx        # next-themes 다크모드 토글
├── hero.tsx
├── deploy-button.tsx
├── env-var-warning.tsx
├── next-logo.tsx
└── supabase-logo.tsx
```

**🧩 컴포넌트 분류 규칙:**

1. **ui/**: shadcn/ui 기반 재사용 가능한 기본 컴포넌트. 순수 UI만 담당, 비즈니스 로직 없음.
2. **tutorial/**: 스타터킷이 제공하는 튜토리얼 안내용 컴포넌트. 실제 기능과 무관하므로 프로덕션 페이지를 만들 때는 참고만 하고 점진적으로 정리.
3. **루트의 도메인 컴포넌트**(`login-form.tsx` 등): 여러 페이지에서 재사용하지 않는 단일 기능 컴포넌트는 `components/` 루트에 평평하게 둔다. 페이지 수가 늘어나 카테고리가 필요해지면 그때 하위 폴더(`auth/`, `layout/` 등)로 분리.

새로운 레이아웃/네비게이션/프로바이더 컴포넌트가 필요해지면 `components/layout/`, `components/navigation/`, `components/providers/` 식으로 하위 폴더를 추가하되, 실제로 2개 이상의 파일이 모일 때 폴더를 만든다 (단일 파일을 위한 폴더는 만들지 않음).

### lib/ - 유틸리티 및 Supabase 클라이언트

```
lib/
├── utils.ts                 # cn() 등 공통 유틸리티
└── supabase/
    ├── client.ts             # 브라우저용 Supabase 클라이언트 (createBrowserClient)
    ├── server.ts             # 서버용 Supabase 클라이언트 (createServerClient, cookies() 사용)
    ├── proxy.ts              # proxy.ts(구 middleware)에서 세션을 갱신하는 updateSession()
    └── database.types.ts     # `supabase gen types`로 생성된 DB 타입
```

**📚 lib/ 폴더 확장 가이드:**

새 유틸리티가 필요하면 `lib/` 바로 아래에 추가합니다. 폴더가 더 필요해지면 다음과 같이 분리합니다.

```
lib/
├── utils.ts
├── supabase/
├── types/             # TypeScript 타입 정의
├── hooks/             # 커스텀 훅
└── schemas/           # 유효성 검증 스키마 (zod 등을 도입할 경우)
```

## 🏷️ 파일 네이밍 컨벤션

### 파일명 규칙

```bash
# ✅ 올바른 파일명
user-profile.tsx        # kebab-case (권장, 이 프로젝트의 실제 컨벤션)
update-password-form.tsx

# ❌ 잘못된 파일명
user_profile.tsx        # snake_case (금지)
UserProfile.tsx         # 컴포넌트 파일명에 PascalCase 사용 금지 (이 프로젝트는 kebab-case 파일 + PascalCase named export 조합 사용)
```

### 컴포넌트 네이밍

```typescript
// ✅ 파일명은 kebab-case, export하는 컴포넌트명은 PascalCase
// 파일: components/login-form.tsx
export function LoginForm() {}

// ❌ 잘못된 컴포넌트 네이밍
export function loginForm() {} // camelCase (금지)
```

### 폴더 네이밍

```bash
# ✅ 올바른 폴더명
components/             # 소문자
auth/                   # 소문자/kebab-case

# ❌ 잘못된 폴더명
Components/            # PascalCase (금지)
user_settings/         # snake_case (금지)
```

## 🔗 경로 별칭 (Path Aliases)

`tsconfig.json`은 `@/*` → 저장소 루트 전체를 매핑합니다 (`"paths": { "@/*": ["./*"] }`). `components.json`에는 다음 별칭이 정의되어 있습니다.

```typescript
// ✅ 경로 별칭 사용 (권장)
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";

// ❌ 상대 경로 사용 (금지)
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
```

**📍 components.json에 정의된 별칭:**

- `@/components` → `components/`
- `@/components/ui` → `components/ui/`
- `@/lib` → `lib/`
- `@/lib/utils` → `lib/utils.ts`
- `@/hooks` → `hooks/` (아직 폴더가 없음 — 커스텀 훅을 추가할 때 루트에 새로 생성)

## 📝 새 파일/폴더 추가 규칙

### 1. 새 UI 컴포넌트 추가

```bash
# shadcn/ui 컴포넌트 추가 (CLI 패키지명은 shadcn, shadcn-ui 아님)
npx shadcn@latest add [component-name]

# 커스텀 UI 컴포넌트 추가
components/ui/custom-component.tsx
```

### 2. 새 페이지 추가

```bash
# 정적 페이지
app/about/page.tsx

# 동적 페이지
app/users/[id]/page.tsx

# 그룹 라우트
app/(marketing)/about/page.tsx
```

### 3. 새 비즈니스 컴포넌트 추가

```bash
# 위치 결정 기준:
1. 특정 페이지에서만 사용 → 해당 페이지 폴더 내
2. 여러 페이지에서 사용 → components/ 루트 또는 적절한 하위 폴더
3. shadcn/ui 기반 순수 UI → components/ui/
```

### 4. 새 유틸리티 추가

```bash
# 공통 유틸리티
lib/utils.ts            # 기존 파일에 추가

# 특화된 유틸리티
lib/date-utils.ts       # 새 파일 생성
```

## 🎯 코드 조직 베스트 프랙티스

### 1. 단일 책임 원칙

- 하나의 파일은 하나의 주요 기능만 담당
- 관련된 타입과 유틸리티는 같은 파일에 포함 가능

### 2. 의존성 순서

```typescript
// 1. 외부 라이브러리
import { useRouter } from "next/navigation";

// 2. 내부 라이브러리 (@/ 경로)
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 3. 상대 경로
import "./component.css";
```

### 3. Export 규칙

```typescript
// ✅ Named export 사용 (이 프로젝트의 컴포넌트 대부분이 이 방식)
export function LoginForm() {}

// ✅ Default export (페이지/레이아웃 컴포넌트, Next.js 관례상 필수)
export default function LoginPage() {}

// ❌ 혼재 사용 지양
export function LoginForm() {}
export default LoginForm; // 같은 컴포넌트를 두 방식으로 export
```

### 4. 파일 크기 관리

- 단일 파일: 300줄 이하 권장
- 300줄 초과 시 분할 고려

## 🚫 금지사항

### ❌ 피해야 할 구조

```bash
# 깊은 중첩 구조 (4단계 이상)
components/pages/auth/forms/login/LoginForm.tsx

# 의미 없는 폴더명
components/misc/
components/common/
components/shared/

# 혼재된 케이스
components/userProfile/LoginForm.tsx
```

### ❌ 피해야 할 패턴

```typescript
// 깊은 상대 경로
import { utils } from "../../../../lib/utils";

// 혼재된 import 스타일
import Button from "@/components/ui/button"; // default
import { Card } from "@/components/ui/card"; // named
```

## ✅ 체크리스트

새 파일/폴더 추가 시 확인사항:

- [ ] `src/` 없이 저장소 루트 기준 경로 사용
- [ ] kebab-case 파일명 사용
- [ ] PascalCase 컴포넌트명 사용 (named export)
- [ ] `@/` 경로 별칭 사용
- [ ] 단일 책임 원칙 준수
- [ ] 파일 크기 300줄 이하 유지

이 가이드를 따라 일관성 있고 유지보수하기 쉬운 프로젝트 구조를 만들어보세요!
