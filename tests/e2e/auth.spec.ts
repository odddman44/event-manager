import { test, expect } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role 키로 RLS를 우회해, INSERT 회귀 테스트용 실제 이벤트 fixture를 만든다.
// (app.spec.ts의 createServiceRoleClient와 동일한 패턴)
function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ──────────────────────────────────────────────
// 접근 제어 미들웨어 (비로그인)
// ──────────────────────────────────────────────
test.describe("접근 제어 - 비로그인 상태", () => {
  test("비로그인 → /dashboard 접근 시 /auth/login 리다이렉트", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("비로그인 → /events/1 접근 시 /auth/login 리다이렉트", async ({
    page,
  }) => {
    await page.goto("/events/1");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("비로그인 → /admin 접근 시 /admin/login 리다이렉트", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("비로그인 → /join/* 접근 허용 (공개)", async ({ page }) => {
    await page.goto("/join/demo-token");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page).not.toHaveURL(/\/admin\/login/);
  });
});

// ──────────────────────────────────────────────
// 일반 사용자 로그인 플로우
// ──────────────────────────────────────────────
test.describe("일반 사용자 로그인 플로우", () => {
  test("유효한 사용자 계정 로그인 → /dashboard 이동", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });
  });

  test("잘못된 비밀번호 → 에러 메시지 표시", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill("wrongpassword");
    await page.getByRole("button", { name: "로그인" }).click();
    // 에러 메시지 문단에 role="alert"를 붙여, 스타일(클래스명) 변경에 영향받지 않고
    // 접근성 역할로 안정적으로 찾을 수 있게 한다.
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("로그인 후 /auth/login 재접근 → /dashboard 리다이렉트", async ({
    page,
  }) => {
    // 먼저 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // 로그인 상태에서 /auth/login 재접근 → 미들웨어가 /dashboard로 리다이렉트
    await page.goto("/auth/login");
    await expect(page).toHaveURL("/dashboard", { timeout: 5000 });
  });

  test("redirect 파라미터의 백슬래시 오픈 리다이렉트 시도 차단 → /dashboard 이동", async ({
    page,
  }) => {
    // "/\evil.com"(인코딩: %2F%5Cevil.com)은 브라우저 URL 파서가 "//evil.com"과
    // 동일하게 해석해 외부로 리다이렉트될 수 있는 값이다. isSafeRedirect가 이를
    // 안전하지 않은 경로로 판별해 무시하고, 원래 로그인 성공 시 기본 목적지로
    // 이동하는지 검증한다.
    await page.goto("/auth/login?redirect=%2F%5Cevil.com");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });
    expect(page.url()).not.toContain("evil.com");
  });
});

// ──────────────────────────────────────────────
// 어드민 로그인 플로우
// ──────────────────────────────────────────────
test.describe("어드민 로그인 플로우", () => {
  test("어드민 계정 로그인 → /admin 이동", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("이메일").fill(process.env.TEST_ADMIN_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/admin", { timeout: 8000 });
  });

  test("일반 사용자 계정으로 /admin/login 시도 → 에러 메시지", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByText("관리자 권한이 없습니다")).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

// ──────────────────────────────────────────────
// 로그아웃
// ──────────────────────────────────────────────
test.describe("로그아웃", () => {
  test("일반 사용자 로그아웃 → 랜딩 페이지 이동", async ({ page }) => {
    // 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // 로그아웃
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });

  test("로그아웃 후 /dashboard 접근 시 /auth/login 리다이렉트", async ({
    page,
  }) => {
    // 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // 로그아웃
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL("/", { timeout: 5000 });

    // 보호 경로 재접근
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ──────────────────────────────────────────────
// user role → /admin 접근 차단
// ──────────────────────────────────────────────
test.describe("role 기반 접근 제어 (로그인 상태)", () => {
  test("일반 사용자가 /admin 접근 시 /dashboard 리다이렉트", async ({
    page,
  }) => {
    // 일반 사용자로 로그인
    await page.goto("/auth/login");
    await page.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 8000 });

    // /admin 접근 시도
    await page.goto("/admin");
    await expect(page).toHaveURL("/dashboard", { timeout: 5000 });
  });
});
// ──────────────────────────────────────────────
// participants 테이블 직접 접근 차단 (RLS 보안 회귀)
// ──────────────────────────────────────────────
test.describe("participants 테이블 RLS", () => {
  test("비로그인 상태로 REST에 직접 INSERT/SELECT 요청을 보내도 거부된다", async ({
    request,
  }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    // INSERT 시도에 쓸 실제 이벤트를 service role로 미리 만들어둔다. 존재하지 않는
    // event_id를 쓰면 FK 제약 위반으로 항상 4xx가 나서, RLS가 막은 것인지 FK가 막은
    // 것인지 구분할 수 없다(#11 재발을 탐지 못함). 실제 event_id를 써야 INSERT 정책이
    // 부활했을 때 FK를 통과해 실제로 200/201이 뜨는 것을 잡아낼 수 있다.
    const adminDb = createServiceRoleClient();
    const { data: organizer, error: organizerError } = await adminDb
      .from("profiles")
      .select("id")
      .eq("email", process.env.TEST_USER_EMAIL!)
      .single();
    if (organizerError || !organizer) {
      throw new Error(
        `테스트용 organizer 프로필을 찾지 못했습니다: ${organizerError?.message}`,
      );
    }
    const { data: event, error: eventError } = await adminDb
      .from("events")
      .insert({
        organizer_id: organizer.id,
        title: "RLS 회귀 테스트용 이벤트",
        event_date: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (eventError || !event) {
      throw new Error(
        `테스트용 이벤트 생성에 실패했습니다: ${eventError?.message}`,
      );
    }

    // INSERT 시도: 실제 event_id로 참여자 생성을 시도한다. INSERT 정책이 아예 없으면
    // Postgres RLS가 "new row violates row-level security policy" 에러로 요청 자체를
    // 거부한다(SELECT처럼 빈 배열로 조용히 필터링되는 게 아니라 4xx 에러 응답).
    // Prefer: return=representation을 쓰지 않는다 — RETURNING은 SELECT 정책까지
    // 통과해야 하므로, SELECT 정책 없이 INSERT 정책만 부활해도 이 요청이 계속 막혀
    // 보여서 INSERT 정책 단독 회귀를 못 잡는다. return=minimal(기본값)이어야 순수하게
    // INSERT 정책만 검증한다.
    const insertResponse = await request.post(
      `${supabaseUrl}/rest/v1/participants`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
        },
        data: {
          event_id: event.id,
          name: "RLS 우회 시도",
        },
      },
    );
    // ok() === false만으로는 NOT NULL/CHECK 제약 위반 등 RLS와 무관한 4xx도
    // 통과시켜버린다. RLS 위반은 PostgREST가 401 + Postgres 에러코드 42501로
    // 응답하므로 그 값을 직접 확인해 "RLS가 막았다"를 못 박는다.
    expect(insertResponse.status()).toBe(401);
    const insertBody = await insertResponse.json();
    expect(insertBody.code).toBe("42501");

    // SELECT 확인용으로 실제 참여자 행을 하나 심어둔다. 이 행이 없으면 아래
    // toEqual([])이 "RLS가 걸러냈다"와 "테이블이 원래 비어있다"를 구분하지 못해
    // 다른 테스트 파일이 남긴 데이터에 우연히 의존하게 된다.
    const { error: participantError } = await adminDb
      .from("participants")
      .insert({ event_id: event.id, name: "SELECT 회귀 테스트용 참여자" });
    if (participantError) {
      throw new Error(
        `테스트용 참여자 생성에 실패했습니다: ${participantError.message}`,
      );
    }

    // SELECT 시도: 참여자를 event_id 조건 없이 직접 조회한다. SELECT 정책이 아예 없으면
    // Postgres RLS가 모든 행을 조용히 필터링한다 — 요청 자체는 200으로 성공하지만
    // 결과가 항상 빈 배열이다(INSERT와 달리 에러가 아님).
    const selectResponse = await request.get(
      `${supabaseUrl}/rest/v1/participants?select=*&limit=1`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
        },
      },
    );
    expect(selectResponse.ok()).toBe(true);
    const selectBody = await selectResponse.json();
    expect(selectBody).toEqual([]);
  });
});
