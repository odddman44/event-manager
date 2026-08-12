// "/"로 시작하고 "//"로는 시작하지 않는 같은 오리진 상대 경로만 허용한다.
// "//evil.com"은 브라우저가 프로토콜 상대 URL로 해석해 외부로 나갈 수 있어 별도로 막는다.
// path는 항상 호출부의 변수를 그대로 전달받는다(예: isSafeRedirect(redirectTo)) —
// `redirectTo ?? null`처럼 표현식으로 감싸서 넘기면 TypeScript가 타입 predicate로
// 원래 변수를 좁혀주지 못해 이후 사용처에서 타입 에러가 난다.
export function isSafeRedirect(
  path: string | null | undefined,
): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}
