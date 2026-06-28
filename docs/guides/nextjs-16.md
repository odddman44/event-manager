# Next.js 16 개발 지침

이 문서는 Claude Code에서 Next.js 16(현재 설치 버전: 16.2.9) 프로젝트를 개발할 때 따라야 할 핵심 규칙과 가이드라인을 제공합니다.

## 🚀 필수 규칙 (엄격 준수)

### App Router 아키텍처

```typescript
// ✅ 올바른 방법: App Router 사용
app/
├── layout.tsx          // 루트 레이아웃
├── page.tsx           // 메인 페이지
├── loading.tsx        // 로딩 UI
├── error.tsx          // 에러 UI
├── not-found.tsx      // 404 페이지
└── dashboard/
    ├── layout.tsx     // 대시보드 레이아웃
    └── page.tsx       // 대시보드 페이지

// ❌ 금지: Pages Router 사용
pages/
├── index.tsx
└── dashboard.tsx
```

> 이 프로젝트는 `src/` 디렉토리를 사용하지 않습니다. `app/`, `components/`, `lib/`은 모두 저장소 루트에 위치합니다. 자세한 구조는 [project-structure.md](./project-structure.md) 참고.

### Server Components 우선 설계

```typescript
// 🚀 필수: 기본적으로 모든 컴포넌트는 Server Components
export default async function UserDashboard() {
  // 서버에서 데이터 가져오기
  const user = await getUser()

  return (
    <div>
      <h1>{user.name}님의 대시보드</h1>
      {/* 클라이언트 컴포넌트가 필요한 경우에만 분리 */}
      <InteractiveChart data={user.analytics} />
    </div>
  )
}

// ✅ 클라이언트 컴포넌트는 최소한으로 사용
'use client'

import { useState } from 'react'

export function InteractiveChart({ data }: { data: Analytics[] }) {
  const [selectedRange, setSelectedRange] = useState('week')
  // 상호작용 로직만 클라이언트에서 처리
  return <Chart data={data} range={selectedRange} />
}
```

### async request APIs 처리

```typescript
// 🚀 Next.js 16: params/searchParams/cookies/headers는 모두 Promise
import { cookies, headers } from 'next/headers'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // 🚀 필수: async request APIs 올바른 처리
  const { id } = await params
  const query = await searchParams
  const cookieStore = await cookies()
  const headersList = await headers()

  const user = await getUser(id)

  return <UserProfile user={user} />
}

// Client Component에서는 async를 쓸 수 없으므로 React의 use()로 풀어야 함
'use client'

import { use } from 'react'

export default function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <div>{id}</div>
}

// ❌ 금지: 동기식 접근 (제거됨)
export default function Page({ params }: { params: { id: string } }) {
  const user = getUser(params.id) // 에러 발생
  return <UserProfile user={user} />
}
```

### Typed Routes 활용

```typescript
// next.config.ts — typedRoutes는 최상위(top-level) 설정
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```

```typescript
import Link from 'next/link'

export function Navigation() {
  return (
    <nav>
      {/* ✅ 타입 안전한 링크 */}
      <Link href="/dashboard/users/123">사용자 상세</Link>

      {/* ❌ 컴파일 에러: 존재하지 않는 경로 */}
      <Link href="/nonexistent-route">잘못된 링크</Link>
    </nav>
  )
}
```

## ✅ Cache Components (이 프로젝트에서 활성화됨)

이 프로젝트의 `next.config.ts`에는 `cacheComponents: true`가 설정되어 있습니다. 이 플래그는 기존의 `ppr`, `useCache`, `dynamicIO` 플래그를 하나로 통합한 Next.js 16의 캐싱 모델입니다.

```typescript
// next.config.ts (실제 설정)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

`cacheComponents`가 켜지면 `'use cache'` 디렉티브, `cacheLife()`, `cacheTag()`를 사용할 수 있습니다. 캐시하지 않은 동적 데이터 접근(예: 캐시되지 않은 `fetch`, `cookies()`, `headers()`)은 해당 요청을 동적으로 만들므로, 정적으로 캐시하고 싶은 부분은 명시적으로 `'use cache'`를 붙여야 합니다.

```typescript
// 🚀 함수 레벨 캐싱
import { cacheLife, cacheTag } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')
  return db.query('SELECT * FROM products')
}

// 🚀 컴포넌트 레벨 캐싱
export async function ProductList() {
  'use cache'
  const products = await getProducts()
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}

// 🚀 파일 레벨 캐싱 (파일 전체가 캐시 가능해야 하므로 export하는 함수는 모두 async여야 함)
'use cache'

export default async function Page() {
  // ...
}
```

캐시 무효화는 기존과 동일하게 태그 기반으로 처리합니다.

```typescript
import { revalidateTag } from "next/cache";

export async function updateProduct(id: string, data: ProductData) {
  await updateDatabase(id, data);
  revalidateTag("products");
}
```

### Streaming과 Suspense 활용

```typescript
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <div>
      <h1>대시보드</h1>

      {/* ✅ 빠른 컨텐츠는 즉시 렌더링 */}
      <QuickStats />

      {/* ✅ 캐시되지 않은 동적 컨텐츠는 Suspense로 감싸기 */}
      <Suspense fallback={<SkeletonChart />}>
        <SlowChart />
      </Suspense>
    </div>
  )
}

async function SlowChart() {
  const data = await getComplexAnalytics() // 캐시 안 된 동적 fetch
  return <Chart data={data} />
}
```

### after() API 활용

```typescript
import { after } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  // 즉시 응답 반환
  const result = await processUserData(body);

  // 🔄 비블로킹 작업은 after()로 처리
  after(async () => {
    await sendAnalytics(result);
    await sendNotification(result.userId);
  });

  return Response.json({ success: true, id: result.id });
}
```

### Turbopack 설정

```typescript
// next.config.ts — turbopack은 최상위(top-level) 설정 키 (experimental.turbo 아님)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // 커스텀 모듈 별칭
    },
  },
  // 패키지 import 최적화는 여전히 experimental 아래에 위치
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
};

export default nextConfig;
```

## ⚠️ Breaking Changes 대응

### middleware.ts → proxy.ts 전환

Next.js 16에서 `middleware.ts`는 `proxy.ts`로 이름이 바뀌었고, export하는 함수명도 `middleware` → `proxy`로 바뀌었습니다. 이 프로젝트는 이미 이 컨벤션을 따르고 있습니다 (`proxy.ts`, `lib/supabase/proxy.ts`).

```typescript
// proxy.ts (실제 파일)
import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

관련 설정 플래그도 이름이 바뀌었습니다: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`. 타입을 직접 import하는 경우 `NextMiddleware` → `NextProxy`, `MiddlewareConfig` → `ProxyConfig`로 바뀐 점도 참고하세요.

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipProxyUrlNormalize: true,
};

export default nextConfig;
```

### React 19 호환성

```typescript
// ✅ useFormStatus 훅
'use client'

import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending}>
      {pending ? '제출 중...' : '제출'}
    </button>
  )
}

// ✅ Server Actions와 form 통합
export async function createUser(formData: FormData) {
  'use server'

  const name = formData.get('name') as string
  const email = formData.get('email') as string

  await saveUser({ name, email })
  redirect('/users')
}

export default function UserForm() {
  return (
    <form action={createUser}>
      <input name="name" required />
      <input name="email" type="email" required />
      <SubmitButton />
    </form>
  )
}
```

### unauthorized/forbidden API

```typescript
// app/api/admin/route.ts
import { unauthorized, forbidden } from "next/server";

export async function GET(request: Request) {
  const session = await getSession(request);

  if (!session) {
    return unauthorized();
  }

  if (!session.user.isAdmin) {
    return forbidden();
  }

  const data = await getAdminData();
  return Response.json(data);
}
```

## 🔄 New Features 활용

### Route Groups 고급 패턴

```typescript
// ✅ Route Groups로 레이아웃 분리
app/
├── (marketing)/
│   ├── layout.tsx     // 마케팅 레이아웃
│   ├── page.tsx       // 홈페이지
│   └── about/
│       └── page.tsx   // 소개 페이지
├── (dashboard)/
│   ├── layout.tsx     // 대시보드 레이아웃
│   └── analytics/
│       └── page.tsx   // 분석 페이지
└── (auth)/
    ├── login/
    │   └── page.tsx
    └── register/
        └── page.tsx

// (marketing)/layout.tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="marketing-layout">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  )
}
```

### Parallel Routes 활용

```typescript
// ✅ Parallel Routes로 동시 렌더링
app/
├── dashboard/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── @analytics/
│   │   └── page.tsx
│   └── @notifications/
│       └── page.tsx

// dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,
  notifications,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  notifications: React.ReactNode
}) {
  return (
    <div className="dashboard-grid">
      <main>{children}</main>
      <aside className="analytics-panel">
        <Suspense fallback={<AnalyticsSkeleton />}>
          {analytics}
        </Suspense>
      </aside>
      <div className="notifications-panel">
        <Suspense fallback={<NotificationsSkeleton />}>
          {notifications}
        </Suspense>
      </div>
    </div>
  )
}
```

### Intercepting Routes

```typescript
// ✅ Intercepting Routes로 모달 구현
app/
├── gallery/
│   ├── page.tsx
│   └── [id]/
│       └── page.tsx    // 전체 페이지 보기
└── @modal/
    └── (.)gallery/
        └── [id]/
            └── page.tsx // 모달 보기

// @modal/(.)gallery/[id]/page.tsx
import { Modal } from '@/components/modal'

export default async function PhotoModal({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const photo = await getPhoto(id)

  return (
    <Modal>
      <img src={photo.url} alt={photo.title} />
    </Modal>
  )
}
```

## ❌ 금지 사항

### Pages Router 사용 금지

```typescript
// ❌ 절대 금지: Pages Router 패턴
pages/
├── _app.tsx
├── _document.tsx
├── index.tsx
└── api/
    └── users.ts

// ❌ 금지: getServerSideProps, getStaticProps 사용
export async function getServerSideProps() {
  // 이 방식은 사용하지 마세요
}
```

### 안티패턴 방지

```typescript
// ❌ 금지: 불필요한 'use client' 사용
'use client'

export default function SimpleComponent({ title }: { title: string }) {
  // 상태나 이벤트 핸들러가 없는데 'use client' 사용
  return <h1>{title}</h1>
}

// ✅ 올바른 방법: Server Component로 유지
export default function SimpleComponent({ title }: { title: string }) {
  return <h1>{title}</h1>
}

// ❌ 금지: 클라이언트에서 서버 함수 직접 호출
'use client'

import { getUser } from '@/lib/database' // 서버 전용 함수

export function UserProfile() {
  const user = getUser() // 에러 발생
  return <div>{user.name}</div>
}

// ✅ 올바른 방법: 서버에서 데이터 전달
export default async function UserPage() {
  const user = await getUser()
  return <UserProfile user={user} />
}

function UserProfile({ user }: { user: User }) {
  return <div>{user.name}</div>
}
```

## 코드 품질 체크리스트

개발 완료 후 다음 명령어들을 실행하세요:

```bash
# 🚀 필수: 린트 검사 (ESLint + eslint-config-prettier)
npm run lint

# 🚀 필수: 타입 체크
npm run typecheck

# ✅ 권장: 포맷 검사 (Prettier + prettier-plugin-tailwindcss)
npm run format:check

# 🚀 필수: 빌드 테스트
npm run build
```

`git commit` 시 Husky `pre-commit` 훅이 staged 파일에 lint-staged(ESLint --fix + Prettier --write)를 자동 실행하고, `pre-push` 훅이 `npm run typecheck`를 실행한다. `check-all` 같은 통합 스크립트는 없다.

이 지침을 따라 Next.js 16의 기능을 최대한 활용하여 현대적이고 성능 최적화된 애플리케이션을 개발하세요.
