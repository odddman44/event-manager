import { createHmac, timingSafeEqual } from "crypto";

// 암호를 맞힌 이벤트를 브라우저가 기억하게 하는 쿠키 값을 서명/검증한다. 세션과
// 무관하게(비회원도 대상) 신뢰해야 하므로, 서버 전용 시크릿(SUPABASE_SERVICE_ROLE_KEY —
// 이미 있는 값이라 새 env var를 추가하지 않는다)으로 HMAC 서명해 위조를 막는다.
export function signUnlockToken(shareToken: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(shareToken)
    .digest("hex");
}

export function isValidUnlockToken(shareToken: string, token: string): boolean {
  const expected = signUnlockToken(shareToken);
  const expectedBuffer = Buffer.from(expected, "hex");
  const tokenBuffer = Buffer.from(token, "hex");
  if (expectedBuffer.length !== tokenBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, tokenBuffer);
}

export function unlockCookieName(shareToken: string): string {
  return `moija_unlock_${shareToken}`;
}
