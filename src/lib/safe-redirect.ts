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
