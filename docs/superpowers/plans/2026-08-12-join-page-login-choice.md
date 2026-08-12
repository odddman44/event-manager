# 참여 페이지 로그인/비회원 선택 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참여 링크(`/join/{token}`)를 비로그인 상태로 열면 "비회원으로 계속하기 / 로그인하고 참여하기"를 먼저 선택하게 하고, 로그인을 선택하면 로그인 완료 후 원래 참여 링크로 자동 복귀시킨다. 이미 로그인된 상태라면 선택 화면 없이 바로 참여 폼을 보여주되 이름을 프로필에서 자동으로 채운다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 유지한다. 로그인 후 원래 위치로 돌아오는 기능은 `redirect`/`next` 쿼리 파라미터로 목적지를 실어 나르는 방식이며, 오픈 리다이렉트 공격을 막기 위해 클라이언트/서버 양쪽에서 공유하는 `isSafeRedirect` 검증 함수를 반드시 거친다.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Auth(이메일/구글), Playwright MCP(수동 검증)

**참고 문서:**

- 설계 문서(승인됨): `docs/superpowers/specs/2026-08-12-join-page-login-choice-design.md`
- 로드맵: `docs/roadmaps/ROADMAP_v1.md`

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 Playwright MCP로 수행한다. 테스트 계정은 `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`), 비밀번호는 `TEST_USER_PASSWORD`. **주의: 이전 세션에서 test-user/test-admin 계정을 삭제했을 수 있다 — 계정이 없으면 이 플랜 실행 전에 먼저 새로 만들거나 사람에게 확인해라.**
- **Playwright MCP 로그인 시 `browser_fill_form`을 쓰지 말 것.** 반드시 `browser_type`을 `#email`, `#password` CSS 셀렉터로 개별 호출한다.
- **`browser_take_screenshot`에 `fullPage: true`를 쓰지 말 것.**
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- 리다이렉트 목적지 파라미터(`redirect`, `next`)는 **반드시** `isSafeRedirect` 검증을 거친 뒤에만 사용한다. 검증 없이 리다이렉트에 쓰는 코드는 리뷰에서 반려한다.

---

## Task 1: 안전한 리다이렉트 유틸 + 로그인 흐름 배관

> **배경:** 로그인 페이지가 `redirect` 쿼리 파라미터로 로그인 후 돌아갈 위치를 받고, 이메일 로그인/구글 로그인(OAuth 콜백 경유) 양쪽 모두 그 목적지로 정확히 돌아가도록 배관한다. 검증되지 않은 리다이렉트 파라미터를 그대로 쓰면 `?redirect=https://evil.com` 같은 외부 사이트로 보내는 오픈 리다이렉트 취약점이 되므로, 클라이언트(`login-form.tsx`)와 서버(OAuth 콜백 라우트) 양쪽에서 쓸 수 있는 공유 검증 함수를 먼저 만든다.

**Files:**

- Create: `src/lib/safe-redirect.ts`
- Modify: `app/auth/login/page.tsx`
- Modify: `components/login-form.tsx`
- Modify: `components/google-login-button.tsx`
- Modify: `app/auth/callback/route.ts`

**Interfaces:**

- Produces: `isSafeRedirect(path: string | null): path is string` — `src/lib/safe-redirect.ts`. `/`로 시작하고 `//`로는 시작하지 않는 경로만 `true`.
- `LoginForm`에 `redirectTo?: string` prop 추가.
- `GoogleLoginButton`에 `redirectTo?: string` prop 추가.

- [ ] **Step 1: 안전한 리다이렉트 검증 함수 작성**

`src/lib/safe-redirect.ts` 파일을 새로 만든다:

```ts
// "/"로 시작하는 같은 오리진 상대 경로만 허용한다. 문자열 접두사 검사(startsWith("//"))만으로는
// "/\evil.com"처럼 브라우저의 URL 파서가 "//"와 동일하게 해석하는 변형을 막지 못해 오픈 리다이렉트로
// 이어진다 — 브라우저가 실제로 쓰는 것과 동일한 URL 파서로 검증해야 신뢰할 수 있다.
// path는 항상 호출부의 변수를 그대로 전달받는다(예: isSafeRedirect(redirectTo)) —
// `redirectTo ?? null`처럼 표현식으로 감싸서 넘기면 TypeScript가 타입 predicate로
// 원래 변수를 좁혀주지 못해 이후 사용처에서 타입 에러가 난다.
export function isSafeRedirect(
  path: string | null | undefined,
): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  try {
    const base = "https://safe.invalid";
    return new URL(path, base).origin === base;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 로그인 페이지가 `redirect` 쿼리 파라미터를 읽도록 수정**

`app/auth/login/page.tsx` 전체를:

```tsx
import { LoginForm } from "@/components/login-form";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
```

다음으로 교체한다:

```tsx
import { LoginForm } from "@/components/login-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirect} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `LoginForm`이 `redirectTo`를 받아 로그인 성공 시 사용하도록 수정**

`components/login-form.tsx`의 import 블록 맨 위에 추가한다:

```tsx
import { isSafeRedirect } from "@/src/lib/safe-redirect";
```

다음 블록을:

```tsx
export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
```

다음으로 교체한다:

```tsx
interface LoginFormProps extends React.ComponentPropsWithoutRef<"div"> {
  redirectTo?: string;
}

export function LoginForm({ className, redirectTo, ...props }: LoginFormProps) {
```

다음 블록을(로그인 성공 후 이동 로직):

```tsx
router.push(profile?.role === "admin" ? "/admin" : "/dashboard");
```

다음으로 교체한다:

```tsx
if (isSafeRedirect(redirectTo)) {
  router.push(redirectTo);
} else {
  router.push(profile?.role === "admin" ? "/admin" : "/dashboard");
}
```

`<GoogleLoginButton />`을 `<GoogleLoginButton redirectTo={redirectTo} />`로 교체한다.

- [ ] **Step 4: `GoogleLoginButton`이 `redirectTo`를 콜백 URL에 실어 보내도록 수정**

`components/google-login-button.tsx`의 import 블록에 추가한다:

```tsx
import { isSafeRedirect } from "@/src/lib/safe-redirect";
```

다음 블록을:

```tsx
export function GoogleLoginButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
```

다음으로 교체한다:

```tsx
interface GoogleLoginButtonProps {
  redirectTo?: string;
}

export function GoogleLoginButton({ redirectTo }: GoogleLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    // 구글 로그인은 Supabase 인증 서버를 거쳐 돌아오므로, 최종 목적지를
    // /auth/callback의 쿼리 파라미터로 실어 보낸다.
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (isSafeRedirect(redirectTo)) {
      callbackUrl.searchParams.set("next", redirectTo);
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
```

- [ ] **Step 5: OAuth 콜백 라우트가 `next` 파라미터를 읽어 검증 후 사용하도록 수정**

`app/auth/callback/route.ts` 전체를:

```ts
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      redirect(profile?.role === "admin" ? "/admin" : "/dashboard");
    }

    redirect(`/auth/error?error=${error?.message ?? "Unknown error"}`);
  }

  redirect(`/auth/error?error=No code provided`);
}
```

다음으로 교체한다:

```ts
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { isSafeRedirect } from "@/src/lib/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (isSafeRedirect(next)) {
        redirect(next);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      redirect(profile?.role === "admin" ? "/admin" : "/dashboard");
    }

    redirect(`/auth/error?error=${error?.message ?? "Unknown error"}`);
  }

  redirect(`/auth/error?error=No code provided`);
}
```

- [ ] **Step 6: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: 검증 (Playwright MCP, 포트 3001)**

1. 로그아웃 상태에서 `/auth/login?redirect=/dashboard`로 접속 → 이메일 로그인 → `/dashboard`로 정상 이동하는지 확인
2. `/auth/login?redirect=https://evil.com`으로 접속 → 로그인 → **`/dashboard`나 `/admin`으로 안전하게 폴백되는지 확인** (evil.com으로 가면 안 됨 — 핵심 검증 포인트)
3. `/auth/login`(파라미터 없이) → 로그인 → 기존처럼 역할 기반(`/dashboard`/`/admin`)으로 이동하는지 확인(회귀)
4. 구글 로그인 버튼이 있는 화면 확인(실제 구글 계정으로 끝까지 로그인하는 건 이 Task에서 자동화하지 않는다 — 콜백 URL 구성 로직은 코드 리뷰로 확인해도 충분하다)

- [ ] **Step 8: 커밋**

```bash
git add src/lib/safe-redirect.ts app/auth/login/page.tsx components/login-form.tsx components/google-login-button.tsx app/auth/callback/route.ts
git commit -m "✨ feat: 로그인 후 원래 위치로 돌아가는 안전한 리다이렉트 배관 추가"
```

---

## Task 2: 참여 페이지에 로그인/비회원 선택 화면 추가

> **배경:** 참여 링크를 비로그인 상태로 열면 "비회원으로 계속하기 / 로그인하고 참여하기" 선택 화면을 먼저 보여준다. 로그인 상태(아직 이 이벤트에 참여 안 함)라면 선택 화면 없이 바로 참여 폼을 보여주되 이름을 프로필에서 자동으로 채운다.

**Files:**

- Modify: `src/repositories/profile-repository.ts`
- Modify: `src/services/profile-service.ts`
- Modify: `app/join/[share_token]/page.tsx`
- Modify: `components/join-form.tsx`

**Interfaces:**

- Consumes: Task 1의 `isSafeRedirect`는 여기서 쓰지 않는다(참여 페이지 자체는 리다이렉트 목적지가 아니라 출발점이다)
- Produces:
  - `getFullName(supabase: SupabaseClient<Database>, userId: string): Promise<string | null>` — `src/repositories/profile-repository.ts`
  - `getFullName(supabase: SupabaseClient<Database>, userId: string): Promise<string>` — `src/services/profile-service.ts`. 조회 실패 시 빈 문자열 반환.
  - `JoinForm`에 `isLoggedIn: boolean`, `loggedInName: string` prop 추가.

- [ ] **Step 1: `profile-repository.ts`에 `getFullName` 추가**

`src/repositories/profile-repository.ts`의 `getOnboardingCompletedAt` 함수 **바로 아래**에 추가한다:

```ts
export async function getFullName(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data.full_name;
}
```

- [ ] **Step 2: `profile-service.ts`에 `getFullName` 추가**

`src/services/profile-service.ts`의 profile-repository import 블록을 다음으로 교체한다:

```ts
import {
  getOnboardingCompletedAt as getOnboardingCompletedAtRepository,
  completeOnboarding as completeOnboardingRepository,
  getFullName as getFullNameRepository,
} from "../repositories/profile-repository";
```

같은 파일 끝에 추가한다:

```ts
// 참여 페이지에서 로그인 사용자의 이름을 미리 채워주기 위한 용도. 조회 실패 시
// 빈 문자열로 대체한다 — 이름 자동입력은 편의 기능이라 실패가 참여 자체를 막으면 안 된다.
export async function getFullName(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  try {
    return (await getFullNameRepository(supabase, userId)) ?? "";
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: 참여 페이지가 로그인 이름을 조회해 넘기도록 수정**

`app/join/[share_token]/page.tsx` 전체를:

```tsx
import { Suspense } from "react";
import JoinForm from "@/components/join-form";
import { createClient } from "@/lib/supabase/server";
import { getJoinPageData } from "@/src/services/participant-service";

async function JoinPageContent({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const data = await getJoinPageData(supabase, share_token, userId);

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-800">
          😕 유효하지 않은 참여 링크입니다.
        </p>
        <p className="mt-2 text-sm text-gray-500">링크를 다시 확인해주세요.</p>
      </main>
    );
  }

  return (
    <JoinForm
      shareToken={share_token}
      event={data.event}
      registeredCount={data.registeredCount}
      isFull={data.isFull}
      existingParticipant={data.existingParticipant}
    />
  );
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  return (
    <Suspense>
      <JoinPageContent params={params} />
    </Suspense>
  );
}
```

다음으로 교체한다:

```tsx
import { Suspense } from "react";
import JoinForm from "@/components/join-form";
import { createClient } from "@/lib/supabase/server";
import { getJoinPageData } from "@/src/services/participant-service";
import { getFullName } from "@/src/services/profile-service";

async function JoinPageContent({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const [data, loggedInName] = await Promise.all([
    getJoinPageData(supabase, share_token, userId),
    userId ? getFullName(supabase, userId) : Promise.resolve(""),
  ]);

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-800">
          😕 유효하지 않은 참여 링크입니다.
        </p>
        <p className="mt-2 text-sm text-gray-500">링크를 다시 확인해주세요.</p>
      </main>
    );
  }

  return (
    <JoinForm
      shareToken={share_token}
      event={data.event}
      registeredCount={data.registeredCount}
      isFull={data.isFull}
      existingParticipant={data.existingParticipant}
      isLoggedIn={userId !== null}
      loggedInName={loggedInName}
    />
  );
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  return (
    <Suspense>
      <JoinPageContent params={params} />
    </Suspense>
  );
}
```

- [ ] **Step 4: `JoinForm`에 `isLoggedIn`/`loggedInName` props 추가 및 초기 상태 로직 수정**

`components/join-form.tsx`에서 다음 블록을:

```tsx
// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full";
```

다음으로 교체한다:

```tsx
// UI 상태 타입 정의
type PageState = "form" | "completed" | "cancelled" | "full" | "choice";
```

`import { useEffect, useState } from "react";`를 다음으로 교체한다:

```tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
```

다음 블록을:

```tsx
interface JoinFormProps {
  shareToken: string;
  event: Event;
  registeredCount: number;
  isFull: boolean;
  existingParticipant: {
    guestToken: string;
    name: string;
    memo: string | null;
    status: ParticipantStatus;
  } | null;
}

export default function JoinForm({
  shareToken,
  event,
  registeredCount,
  isFull,
  existingParticipant,
}: JoinFormProps) {
  const [state, setState] = useState<PageState>(() => {
    if (existingParticipant) {
      return existingParticipant.status === "cancelled"
        ? "cancelled"
        : "completed";
    }
    return isFull ? "full" : "form";
  });
```

다음으로 교체한다:

```tsx
interface JoinFormProps {
  shareToken: string;
  event: Event;
  registeredCount: number;
  isFull: boolean;
  existingParticipant: {
    guestToken: string;
    name: string;
    memo: string | null;
    status: ParticipantStatus;
  } | null;
  isLoggedIn: boolean;
  loggedInName: string;
}

export default function JoinForm({
  shareToken,
  event,
  registeredCount,
  isFull,
  existingParticipant,
  isLoggedIn,
  loggedInName,
}: JoinFormProps) {
  const router = useRouter();
  const [state, setState] = useState<PageState>(() => {
    if (existingParticipant) {
      return existingParticipant.status === "cancelled"
        ? "cancelled"
        : "completed";
    }
    if (isFull) {
      return "full";
    }
    return isLoggedIn ? "form" : "choice";
  });
```

다음 줄을(신규 참여 폼 이름 입력값 초기화):

```tsx
const [name, setName] = useState("");
```

다음으로 교체한다:

```tsx
// 로그인 상태면 프로필 이름으로 미리 채운다(비로그인이면 loggedInName이 빈 문자열).
const [name, setName] = useState(loggedInName);
```

- [ ] **Step 5: "choice" 상태 UI 추가**

`components/join-form.tsx`에서 다음 블록(신규 참여 폼 바로 위) 앞에:

```tsx
        {/* State 1: 신규 참여 폼 */}
        {state === "form" && (
```

아래 블록을 삽입한다(즉 "State 1" 주석 바로 위에 추가):

```tsx
        {/* State 0: 로그인/비회원 선택 (비로그인 방문자만) */}
        {state === "choice" && (
          <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800">참여 방법 선택</h2>
            <Button
              className="bg-primary hover:bg-primary/90 w-full text-white"
              onClick={() =>
                router.push(
                  `/auth/login?redirect=${encodeURIComponent(`/join/${shareToken}`)}`,
                )
              }
            >
              로그인하고 참여하기
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setState("form")}
            >
              비회원으로 계속하기
            </Button>
          </div>
        )}

        {/* State 1: 신규 참여 폼 */}
        {state === "form" && (
```

- [ ] **Step 6: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: 검증 (Playwright MCP, 포트 3001)**

사전 준비: `test-user@moija.dev`로 이벤트를 하나 만들어 공유 링크를 확보한다.

1. 로그아웃 상태에서 그 참여 링크 접속 → "참여 방법 선택" 화면(버튼 2개) 확인
2. "비회원으로 계속하기" 클릭 → 기존과 동일한 이름/메모 폼이 뜨는지, 이름이 비어있는지 확인 → 참여까지 정상 동작(회귀)
3. 새 시크릿 컨텍스트에서 같은 링크 접속 → "로그인하고 참여하기" 클릭 → `/auth/login?redirect=/join/{token}`으로 이동 확인 → `test-user@moija.dev`로 로그인 → **원래 참여 링크로 자동 복귀하는지 확인** → 이름 필드에 "테스트 유저"(프로필 이름)가 자동 채워져 있는지 확인 → 참여 제출
4. `mcp__supabase__execute_sql`로 방금 생성된 participant 행에 `user_id`가 채워졌는지 확인
5. 같은 계정으로 다른 브라우저 컨텍스트에서 같은 링크 재접속 → 즉시 "완료" 상태로 인식되는지 확인(크로스 디바이스 회귀, "choice" 화면을 건너뛰어야 함)
6. 정원이 가득 찬 이벤트의 참여 링크를 로그아웃 상태로 접속 → "choice" 화면이 아니라 바로 "정원이 가득 찼어요" 화면이 뜨는지 확인(회귀)

- [ ] **Step 8: 커밋**

```bash
git add src/repositories/profile-repository.ts src/services/profile-service.ts "app/join/[share_token]/page.tsx" components/join-form.tsx
git commit -m "✨ feat: 참여 페이지에 로그인/비회원 선택 화면 추가"
```

---

## Task 3: 최종 회귀 검증 및 로드맵 갱신

**Files:**

- Modify: `docs/roadmaps/ROADMAP_v1.md`

**Interfaces:** Task 1~2 전체 결과를 검증

- [ ] **Step 1: 전체 품질 게이트**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

`components/event-form.tsx:86` 경고 1건 외 새 경고/에러가 없어야 한다.

- [ ] **Step 2: 기존 E2E 스위트 회귀 확인**

```bash
npx playwright test
```

**35/35 전부 통과해야 한다.**

- [ ] **Step 3: 로드맵 갱신**

`docs/roadmaps/ROADMAP_v1.md`의 "현재 상태" 블록을 다음으로 교체한다(날짜는 이 Task를 실제로 완료하는 날짜를 쓴다):

```markdown
- **진행 단계**: 참여 페이지 로그인/비회원 선택 흐름 완료 — Phase 0~12 전체 완료
- **최종 업데이트**: <오늘 날짜 YYYY-MM-DD>
```

파일 맨 끝(Phase 11 블록 다음)에 다음을 추가한다:

```markdown
### Phase 12: 참여 페이지 로그인/비회원 선택 흐름 ✅

> 참여 링크를 비로그인으로 열면 "비회원으로 계속 / 로그인하고 참여" 선택 화면을
> 보여주고, 로그인 완료 후 원래 참여 링크로 자동 복귀시킨다.
> 설계: `docs/superpowers/specs/2026-08-12-join-page-login-choice-design.md`
> 상세 계획: `docs/superpowers/plans/2026-08-12-join-page-login-choice.md`

- **Task 031: 안전한 로그인 리다이렉트** ✅ - 완료
  - [x] isSafeRedirect 검증 함수 + 로그인/구글 로그인/OAuth 콜백 배관

- **Task 032: 참여 페이지 선택 화면** ✅ - 완료
  - [x] 비로그인 방문자에게 선택 화면, 로그인 상태는 이름 자동입력
```

- [ ] **Step 4: 포맷 검증 및 커밋**

```bash
npm run format:check
git add docs/roadmaps/ROADMAP_v1.md
git commit -m "📝 docs: 로드맵 Phase 12(참여 페이지 로그인 선택) 완료 처리"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- **이벤트별 "회원만 참가" 옵션** — 다음 작업으로 예정. 백로그 노트 참고.
- **참여자 목록 공개(회원/비회원 모두)** — 백로그 노트 참고.
- **이벤트 암호 보호** — 백로그 노트 참고.
- **날짜 범위(여러 날) 모임 지원** — 백로그 노트 참고.
