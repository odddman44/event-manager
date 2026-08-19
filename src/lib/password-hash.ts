import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

// 이벤트 암호(#7) 해시 저장용. bcrypt/argon2 같은 새 의존성 없이 Node 내장 scrypt를 쓴다.
// salt는 매번 랜덤 생성해 "salt:hash" 형식의 hex 문자열 하나로 저장한다.
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

// 길이가 다른 문자열을 timingSafeEqual에 넘기면 예외가 나므로, 형식이 깨진 저장값은
// 안전하게 false로 처리한다(비교 자체를 시도하지 않음 — 그래도 타이밍 정보는 새지 않는다).
export function verifyPasswordHash(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const hashBuffer = Buffer.from(hash, "hex");
  const candidateBuffer = scryptSync(plain, salt, KEY_LENGTH);
  if (hashBuffer.length !== candidateBuffer.length) {
    return false;
  }
  return timingSafeEqual(hashBuffer, candidateBuffer);
}
