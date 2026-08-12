import { test, expect } from "@playwright/test";

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
