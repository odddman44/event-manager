import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────
// 랜딩 페이지
// ──────────────────────────────────────────────
test.describe("랜딩 페이지 /", () => {
  test("모이자 브랜딩과 CTA 버튼이 표시된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toContainText("모이자");
    await expect(page.getByRole("link", { name: "시작하기" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "로그인" }).first(),
    ).toBeVisible();
  });

  test("기능 카드 3개가 표시된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("간편한 이벤트 생성")).toBeVisible();
    await expect(page.getByText("회원가입 없는 참여")).toBeVisible();
    await expect(page.getByText("실시간 참여 현황")).toBeVisible();
  });

  test("시작하기 버튼이 회원가입 페이지로 이동한다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "시작하기" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });
});

// ──────────────────────────────────────────────
// 사용자 로그인 /auth/login
// ──────────────────────────────────────────────
test.describe("사용자 로그인 /auth/login", () => {
  test("로그인 폼이 표시된다 (사이드바 없음)", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
    // 어드민 사이드바 없어야 함
    await expect(page.getByText("Moija Admin")).not.toBeVisible();
  });

  test("회원가입 페이지로 이동한다", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("link", { name: /회원가입/ }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });
});

// ──────────────────────────────────────────────
// 회원가입 /auth/sign-up
// ──────────────────────────────────────────────
test.describe("회원가입 /auth/sign-up", () => {
  test("회원가입 폼이 표시된다", async ({ page }) => {
    await page.goto("/auth/sign-up");
    await expect(page.getByLabel("이름")).toBeVisible();
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 관리자 로그인 /admin/login
// ──────────────────────────────────────────────
test.describe("관리자 로그인 /admin/login", () => {
  test("Moija Admin 브랜딩과 로그인 폼이 표시된다", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByText("Moija Admin")).toBeVisible();
    await expect(page.getByText("관리자 로그인")).toBeVisible();
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
  });

  test("어드민 사이드바가 없다 (로그인 전)", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(
      page.getByRole("link", { name: "대시보드" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("link", { name: "이벤트 관리" }),
    ).not.toBeVisible();
  });

  test("로그인 후 어드민 대시보드로 이동한다", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("이메일").fill(process.env.TEST_ADMIN_EMAIL!);
    await page.getByLabel("비밀번호").fill(process.env.TEST_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL("/admin", { timeout: 5000 });
  });

  test("일반 사용자 로그인 링크가 있다", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("link", { name: "여기" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });
});

// ──────────────────────────────────────────────
// 어드민 대시보드 /admin
// ──────────────────────────────────────────────
test.describe("어드민 대시보드 /admin", () => {
  test.use({ storageState: "tests/.auth/admin.json" });

  test("사이드바에 4개 메뉴가 있다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "대시보드" })).toBeVisible();
    await expect(page.getByRole("link", { name: "이벤트 관리" })).toBeVisible();
    await expect(page.getByRole("link", { name: "사용자 관리" })).toBeVisible();
    await expect(page.getByRole("link", { name: "통계 분석" })).toBeVisible();
  });

  test("통계 카드 4개가 표시된다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("총 이벤트")).toBeVisible();
    await expect(page.getByText("총 사용자")).toBeVisible();
    await expect(page.getByText("진행 중 이벤트")).toBeVisible();
    await expect(page.getByText("이번 달 신규")).toBeVisible();
  });

  test("사이드바 Moija Admin 로고가 표시된다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("aside").getByText("Moija Admin")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 어드민 이벤트 관리 /admin/events
// ──────────────────────────────────────────────
test.describe("어드민 이벤트 관리 /admin/events", () => {
  test.use({ storageState: "tests/.auth/admin.json" });

  test("이벤트 테이블과 삭제 버튼이 표시된다", async ({ page }) => {
    await page.goto("/admin/events");
    await expect(page.getByText("이벤트 관리")).toBeVisible();
    await expect(page.getByText("2025 개발자 네트워킹 밤")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "삭제" }).first(),
    ).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 어드민 사용자 관리 /admin/users
// ──────────────────────────────────────────────
test.describe("어드민 사용자 관리 /admin/users", () => {
  test.use({ storageState: "tests/.auth/admin.json" });

  test("10명 사용자가 표시된다", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByText("사용자 관리")).toBeVisible();
    await expect(page.getByText("총 10명")).toBeVisible();
    await expect(page.getByText("김민준")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 통계 분석 /admin/stats
// ──────────────────────────────────────────────
test.describe("어드민 통계 분석 /admin/stats", () => {
  test.use({ storageState: "tests/.auth/admin.json" });

  test("4개 차트 제목이 표시된다", async ({ page }) => {
    await page.goto("/admin/stats");
    await expect(page.getByText("이벤트 생성 추이")).toBeVisible();
    await expect(page.getByText("이벤트 상태 분포")).toBeVisible();
    await expect(page.getByText("사용자 가입 추이")).toBeVisible();
    await expect(page.getByText("인기 이벤트 TOP 5")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 주최자 대시보드 /dashboard
// ──────────────────────────────────────────────
test.describe("주최자 대시보드 /dashboard", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("모이자 헤더와 이벤트 카드가 표시된다", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("header").getByText("모이자")).toBeVisible();
    await expect(page.getByText("2025 개발자 네트워킹 밤")).toBeVisible();
  });

  test("새 이벤트 만들기 버튼이 있다", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "새 이벤트 만들기" }),
    ).toBeVisible();
  });

  test("모바일 하단 네비게이션이 있다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText("홈")).toBeVisible();
    await expect(page.getByText("이벤트")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 이벤트 관리 /events/1
// ──────────────────────────────────────────────
test.describe("이벤트 관리 /events/1", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("이벤트 정보와 공유 코드가 표시된다", async ({ page }) => {
    await page.goto("/events/1");
    await expect(page.getByText("2025 개발자 네트워킹 밤")).toBeVisible();
    await expect(page.getByText("DEV2025")).toBeVisible();
  });

  test("참여자 목록에 아바타가 표시된다", async ({ page }) => {
    await page.goto("/events/1");
    await expect(page.getByText("김민준")).toBeVisible();
    await expect(page.getByText("호스트")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 참여 페이지 /join/demo-token
// ──────────────────────────────────────────────
test.describe("참여 페이지 /join/demo-token", () => {
  test("이벤트 정보와 참여 폼이 표시된다", async ({ page }) => {
    await page.goto("/join/demo-token");
    await expect(page.getByText("2025 개발자 네트워킹 밤")).toBeVisible();
    await expect(page.getByRole("button", { name: "참여하기" })).toBeVisible();
  });

  test("이름 입력 후 참여하면 완료 상태로 전환된다", async ({ page }) => {
    await page.goto("/join/demo-token");
    await page.getByPlaceholder("홍길동").fill("테스트 참여자");
    await page.getByRole("button", { name: "참여하기" }).click();
    await expect(page.getByText("참여 신청이 완료되었습니다!")).toBeVisible();
  });
});
