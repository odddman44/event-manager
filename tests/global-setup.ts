import { chromium, type FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";

async function globalSetup(config: FullConfig) {
  // 테스트 계정 env var가 없으면 세션 저장 스킵 (비로그인 테스트만 실행 가능)
  if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_USER_EMAIL) {
    console.log(
      "[global-setup] TEST_ADMIN_EMAIL / TEST_USER_EMAIL 미설정 → auth 세션 저장 스킵",
    );
    return;
  }

  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";
  const authDir = path.join(process.cwd(), "tests/.auth");

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();

  // 어드민 세션 저장
  const adminPage = await browser.newPage();
  await adminPage.goto(`${baseURL}/admin/login`);
  await adminPage.getByLabel("이메일").fill(process.env.TEST_ADMIN_EMAIL!);
  await adminPage.getByLabel("비밀번호").fill(process.env.TEST_ADMIN_PASSWORD!);
  await adminPage.getByRole("button", { name: "로그인" }).click();
  await adminPage.waitForURL(`${baseURL}/admin`, { timeout: 10000 });
  await adminPage.context().storageState({ path: "tests/.auth/admin.json" });
  await adminPage.close();

  // 일반 사용자 세션 저장
  const userPage = await browser.newPage();
  await userPage.goto(`${baseURL}/auth/login`);
  await userPage.getByLabel("이메일").fill(process.env.TEST_USER_EMAIL!);
  await userPage.getByLabel("비밀번호").fill(process.env.TEST_USER_PASSWORD!);
  await userPage.getByRole("button", { name: "로그인" }).click();
  await userPage.waitForURL(`${baseURL}/dashboard`, { timeout: 10000 });
  await userPage.context().storageState({ path: "tests/.auth/user.json" });
  await userPage.close();

  await browser.close();
}

export default globalSetup;
