import { test, expect, type Page } from "@playwright/test";

// browser.newContext()로 만든 컨텍스트는 playwright.config.ts의 use.baseURL을 상속하지
// 않으므로(fixture가 아니라 raw browser API다) 직접 넘겨야 상대 경로 goto가 동작한다.
const BASE_URL = "http://localhost:3001";

// 스타터킷 시절 고정 더미 데이터에 의존하던 테스트들을, 테스트가 직접 만든 이벤트로
// 검증하도록 바꾸기 위한 헬퍼. 이름에 타임스탬프를 넣어 병렬/반복 실행에도 충돌하지 않는다.
async function createEvent(
  page: Page,
  options: { maxParticipants?: number; membersOnly?: boolean } = {},
): Promise<{ title: string; eventId: string; shareToken: string }> {
  const title = `E2E 이벤트 ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  await page.goto("/events/new");
  await page.locator("input#title").fill(title);
  await page.locator("input#event_date").fill("2026-12-31T19:00");
  if (options.maxParticipants !== undefined) {
    await page
      .locator("input#max_participants")
      .fill(String(options.maxParticipants));
  }
  if (options.membersOnly) {
    await page.locator("#members_only").click();
  }
  await page.getByRole("button", { name: "이벤트 만들기" }).click();

  // 생성 성공 시 /events/{id}로 이동한다
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop()!;
  // 상세 페이지는 Suspense로 감싼 서버 컴포넌트라 URL 전환 직후에는 아직
  // 공유 링크가 렌더링되지 않을 수 있다. 네트워크가 잦아들 때까지 기다린다.
  await page.waitForLoadState("networkidle");

  // 상세 페이지에 표시된 공유 링크에서 share_token을 뽑아낸다.
  // 특정 요소를 로케이터로 집으면 마크업이 바뀔 때 깨지므로 페이지 텍스트 전체에서 찾는다.
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/\/join\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error("이벤트 상세 페이지에서 공유 링크를 찾지 못했습니다.");
  }
  const shareToken = match[1];

  return { title, eventId, shareToken };
}

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
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "대시보드" })).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "이벤트 관리" }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "사용자 관리" }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "통계 분석" }),
    ).toBeVisible();
  });

  test("통계 카드 4개가 표시된다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("총 이벤트")).toBeVisible();
    await expect(page.getByText("총 사용자")).toBeVisible();
    await expect(page.getByText("총 참여자 수")).toBeVisible();
    await expect(page.getByText("진행 예정 이벤트")).toBeVisible();
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
    await expect(
      page.getByRole("heading", { name: "이벤트 관리" }),
    ).toBeVisible();
    // 테이블 헤더는 데이터와 무관하게 항상 있어야 한다
    await expect(
      page.getByRole("columnheader", { name: "제목" }),
    ).toBeVisible();
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

  test("사용자 목록이 표시된다", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "사용자 관리" }),
    ).toBeVisible();
    // 총 인원은 계속 변하므로 정확한 숫자 대신 "총 N명" 형식만 확인한다
    await expect(page.getByText(/총 \d+명/)).toBeVisible();
    // 테스트 계정은 항상 존재한다
    await expect(page.getByText(process.env.TEST_USER_EMAIL!)).toBeVisible();
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
    const { title } = await createEvent(page);
    await page.goto("/dashboard");
    await expect(page.locator("header").getByText("모이자")).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
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
    const bottomNav = page.locator("nav.fixed");
    // "이벤트"는 "새 이벤트"의 부분 문자열이라 exact 매칭으로 구분한다
    await expect(bottomNav.getByText("이벤트", { exact: true })).toBeVisible();
    await expect(bottomNav.getByText("새 이벤트")).toBeVisible();
    await expect(bottomNav.getByText("프로필")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// 이벤트 관리 /events/{id}
// ──────────────────────────────────────────────
test.describe("이벤트 관리 /events/{id}", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("이벤트 정보와 공유 링크가 표시된다", async ({ page }) => {
    const { title, shareToken } = await createEvent(page);
    await expect(page.getByText(title)).toBeVisible();
    await expect(
      page.getByText(new RegExp(`/join/${shareToken}`)),
    ).toBeVisible();
  });

  test("참여자가 없으면 안내 문구가 표시된다", async ({ page }) => {
    await createEvent(page);
    await expect(page.getByText("참여자 목록")).toBeVisible();
    await expect(page.getByText("아직 참여자가 없습니다.")).toBeVisible();
  });

  test("회원만 참가 체크박스가 생성/수정에 그대로 반영된다", async ({
    page,
  }) => {
    const { eventId } = await createEvent(page, { membersOnly: true });
    await page.goto(`/events/${eventId}/edit`);
    await expect(page.locator("#members_only")).toBeChecked();

    await page.locator("#members_only").click();
    await page.getByRole("button", { name: "수정 완료" }).click();
    await page.waitForURL(`/events/${eventId}`);

    await page.goto(`/events/${eventId}/edit`);
    await expect(page.locator("#members_only")).not.toBeChecked();
  });
});

// ──────────────────────────────────────────────
// 참여 페이지 /join/{share_token}
// ──────────────────────────────────────────────
test.describe("참여 페이지 /join/{share_token}", () => {
  test("이벤트 정보와 참여 폼이 표시된다", async ({ browser }) => {
    // 이벤트 생성은 로그인 컨텍스트에서, 참여는 비회원 컨텍스트에서 수행한다.
    // 로그인 상태로 참여하면 "이미 참여 중" 인식 로직이 걸려 빈 폼이 뜨지 않는다.
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { title, shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    // getByText(title)는 generateMetadata가 넣은 <title> 태그와 본문 <h1>
    // 둘 다에 매치돼 strict mode violation이 나므로 heading 롤로 좁힌다.
    await expect(guestPage.getByRole("heading", { name: title })).toBeVisible();
    // 비로그인 방문자는 먼저 "참여 방법 선택" 화면을 거친다.
    await guestPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await expect(
      guestPage.getByRole("button", { name: "참여하기" }),
    ).toBeVisible();
    await guest.close();
  });

  test("이름 입력 후 참여하면 완료 상태로 전환된다", async ({ browser }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    // 비로그인 방문자는 먼저 "참여 방법 선택" 화면을 거친다.
    await guestPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestPage.getByPlaceholder("홍길동").fill("테스트 참여자");
    await guestPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      guestPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();
    await guest.close();
  });

  test("회원만 참가 이벤트는 비로그인 방문자에게 로그인 버튼만 보인다", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage, {
      membersOnly: true,
    });
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await expect(
      guestPage.getByRole("button", { name: "로그인하고 참여하기" }),
    ).toBeVisible();
    await expect(
      guestPage.getByRole("button", { name: "비회원으로 계속하기" }),
    ).not.toBeVisible();
    await expect(
      guestPage.getByText("이 모임은 회원만 참여할 수 있어요"),
    ).toBeVisible();
    await guest.close();
  });

  test("일반 이벤트는 회원만 옵션 없이 비회원 버튼도 그대로 보인다(회귀)", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await expect(
      guestPage.getByRole("button", { name: "비회원으로 계속하기" }),
    ).toBeVisible();
    await guest.close();
  });

  test("회원만 참가 이벤트도 로그인 상태면 choice 화면 없이 바로 참여 폼이 보인다(회귀)", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage, {
      membersOnly: true,
    });
    await authedPage.goto(`/join/${shareToken}`);
    await expect(authedPage.getByPlaceholder("홍길동")).toBeVisible();
    await expect(authedPage.getByText("참여 방법 선택")).not.toBeVisible();
    await authed.close();
  });

  test("참여자 명단에 회원/비회원이 뱃지와 함께 보인다", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    // 비회원 참가자 참여
    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await guestPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestPage.getByPlaceholder("홍길동").fill("비회원 참가자");
    await guestPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      guestPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();

    // 로그인 사용자(어드민 계정)도 같은 이벤트에 참여
    const member = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/admin.json",
    });
    const memberPage = await member.newPage();
    await memberPage.goto(`/join/${shareToken}`);
    await memberPage.getByRole("button", { name: "참여하기" }).click();
    await expect(
      memberPage.getByText("참여 신청이 완료되었습니다!"),
    ).toBeVisible();
    await member.close();

    // 비회원 참가자가 완료 화면을 새로고침하면 둘 다 명단에 보여야 한다
    await guestPage.reload();
    await expect(guestPage.getByText("함께 참여하는 사람들")).toBeVisible();
    const guestRow = guestPage.locator("li", { hasText: "비회원 참가자" });
    await expect(guestRow.getByText("비회원", { exact: true })).toBeVisible();
    await expect(guestRow.getByTestId("participant-avatar")).toBeVisible();
    const memberRow = guestPage.locator("li", { hasText: "테스트 관리자" });
    await expect(memberRow.getByText("회원", { exact: true })).toBeVisible();
    await expect(memberRow.getByTestId("participant-avatar")).toBeVisible();
    await guest.close();
  });

  test("참여하지 않은 방문자에게는 참여자 명단이 보이지 않는다", async ({
    browser,
  }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guest = await browser.newContext({ baseURL: BASE_URL });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/join/${shareToken}`);
    await expect(guestPage.getByText("함께 참여하는 사람들")).not.toBeVisible();
    await guest.close();
  });

  test("참여를 취소한 사람은 명단에서 빠진다", async ({ browser }) => {
    const authed = await browser.newContext({
      baseURL: BASE_URL,
      storageState: "tests/.auth/user.json",
    });
    const authedPage = await authed.newPage();
    const { shareToken } = await createEvent(authedPage);
    await authed.close();

    const guestA = await browser.newContext({ baseURL: BASE_URL });
    const guestAPage = await guestA.newPage();
    await guestAPage.goto(`/join/${shareToken}`);
    await guestAPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestAPage.getByPlaceholder("홍길동").fill("참가자A");
    await guestAPage.getByRole("button", { name: "참여하기" }).click();

    const guestB = await browser.newContext({ baseURL: BASE_URL });
    const guestBPage = await guestB.newPage();
    await guestBPage.goto(`/join/${shareToken}`);
    await guestBPage
      .getByRole("button", { name: "비회원으로 계속하기" })
      .click();
    await guestBPage.getByPlaceholder("홍길동").fill("참가자B");
    await guestBPage.getByRole("button", { name: "참여하기" }).click();

    await guestBPage.getByRole("button", { name: "참여 취소" }).click();
    await expect(guestBPage.getByText("참여가 취소되었습니다.")).toBeVisible();

    await guestAPage.reload();
    await expect(guestAPage.getByText("함께 참여하는 사람들")).toBeVisible();
    // getByText("참가자A")는 명단 항목 외에 본인 인사말("안녕하세요, 참가자A님!")과도
    // 겹쳐 strict mode 위반이 나므로 명단 <li>로 범위를 좁힌다.
    await expect(
      guestAPage.locator("li", { hasText: "참가자A" }),
    ).toBeVisible();
    await expect(
      guestAPage.locator("li", { hasText: "참가자B" }),
    ).not.toBeVisible();

    await guestA.close();
    await guestB.close();
  });
});
