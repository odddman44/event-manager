# 주최자 온보딩 가이드(2단계 툴팁 투어) 설계

## 배경

배포된 앱을 처음 접했을 때 단계별 안내가 없어서, 회원가입 직후 첫 이벤트를 어떻게 만들고 공유하는지 스스로 찾아야 한다. 주최자(이벤트를 만드는 사람)가 가입 직후 겪는 "무엇부터 해야 하지" 막막함을 줄이기 위해, 실제 화면 위에 뜨는 가벼운 툴팁 투어를 추가한다.

## 범위

- 대상: 주최자(일반 사용자) 역할만. 어드민, 참여자(비회원 포함) 온보딩은 이번 스코프 밖.
- 트리거: 회원가입 직후 주최자가 처음 대시보드에 진입했을 때(정확히는 "이 유저가 만든 이벤트가 0개"인 동안).
- 형태: 화면 위 실제 요소에 붙는 말풍선(툴팁) — 별도 환영 모달/전용 페이지 없음.
- 2단계 구성:
  1. 대시보드 빈 상태의 "이벤트 만들기" 버튼
  2. (실제로 첫 이벤트를 만든 뒤) 이벤트 상세 페이지의 "링크 복사" 버튼
- 이벤트 생성 폼 화면 자체는 자명하다고 보고 안내하지 않는다.
- 건너뛰거나(✕) 실제 버튼을 클릭해 단계를 진행하면 **그 순간 온보딩 전체가 완료 처리**된다. 1단계만 건너뛰어도 2단계는 다시 뜨지 않는다 — 별도 "부분 완료" 상태는 두지 않는다.
- 완료 후 다시 보는 기능(재사용 진입점)은 만들지 않는다.

## 데이터 모델

`profiles` 테이블에 컬럼 추가:

```sql
alter table public.profiles add column onboarding_completed_at timestamptz;

-- 배포 시점에 이미 존재하는 유저에게 온보딩이 갑자기 뜨지 않도록 전원 완료 처리
update public.profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
```

- nullable, 신규 가입자는 기본값 `null` = "아직 온보딩 안 봄".
- 별도 "1단계 완료/2단계 완료" 같은 세분화된 상태는 두지 않는다 — 온보딩은 하나의 흐름이고, 하나의 타임스탬프로 "봤다/안 봤다"만 구분한다.
- RLS: 기존 `profiles`의 "Users can update their own profile" UPDATE 정책이 이미 존재해서(`20260622094718_fix_profiles_advisor_warnings.sql`), 이 컬럼 갱신에 별도 정책이 필요 없다. `hardDeleteParticipant`(Task 1)와 달리 service_role 클라이언트도 필요 없다.

## 노출 조건

- **1단계 (대시보드):** `onboarding_completed_at IS NULL` **그리고** 이 유저가 만든 이벤트가 0개. `app/dashboard/page.tsx`의 `EventSections`가 이미 `createdEvents.length === 0`을 계산하고 있으므로 그 조건을 재사용한다.
- **2단계 (이벤트 상세):** `onboarding_completed_at IS NULL` **그리고** 이 이벤트가 이 유저의 (생성일 기준) 첫 번째 이벤트. 쿼리 파라미터나 별도 세션 상태 없이, "이 유저의 가장 먼저 만든 이벤트 id"와 현재 페이지의 이벤트 id를 비교해서 판별한다 — 새로고침/뒤로가기/북마크로 다시 들어와도 안정적으로 동작한다.

## 레이어드 아키텍처 확장

**`src/repositories/profile-repository.ts` (신규)**

- `completeOnboarding(supabase, userId): Promise<void>` — `profiles.onboarding_completed_at`을 `now()`로 갱신. 일반 요청 클라이언트로 수행(RLS 통과, admin 클라이언트 불필요).

**`src/repositories/event-repository.ts` (기존 파일에 함수 추가)**

- `getEarliestEventIdByOrganizer(supabase, organizerId): Promise<string | null>` — `organizer_id` 기준 `created_at` 오름차순, 동시 생성 시 `id` 오름차순으로 tie-break한 첫 행의 id 반환(Task 1의 `countRegisteredBefore`와 같은 tie-break 관례). 없으면 `null`.

**`src/services/profile-service.ts` (신규, 얇은 패스스루)**

- `completeOnboarding(supabase, userId)` — repository 호출을 그대로 감싼다. 기존 서비스 파일들의 관례대로, repository에서 import할 때 `completeOnboarding as completeOnboardingRepository`로 별칭을 준다.

**`src/controllers/profile-controller.ts` (신규)**

- `"use server" completeOnboardingAction(): Promise<void>` — 현재 로그인 유저 id를 조회해 서비스 호출. 인증 안 된 상태로 호출되면 조용히 무시(에러를 던지지 않음 — 아래 에러 처리 참고).

## UI

**`components/ui/popover.tsx`** — shadcn 표준 컴포넌트 추가(`npx shadcn add popover`). 새 의존성은 `@radix-ui/react-popover` 하나뿐, 이미 쓰고 있는 Radix 계열이라 이질감 없음.

**`components/onboarding/onboarding-callout.tsx` (신규, 클라이언트 컴포넌트)** — 실제 UI 요소를 감싸 그 옆에 항상 열려 있는 말풍선을 붙이는 공용 컴포넌트. `Popover`를 트리거 없이 `open` 상태만 제어해서 사용한다.

```tsx
"use client";

interface OnboardingCalloutProps {
  message: string;
  onDismiss: () => Promise<void>; // 서버 액션
  children: React.ReactNode; // 강조할 실제 UI 요소
}

export function OnboardingCallout({
  message,
  onDismiss,
  children,
}: OnboardingCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const handleDismiss = () => {
    setDismissed(true); // 낙관적으로 즉시 닫음 — 실제 버튼 클릭도 이걸 거친다
    startTransition(() => {
      onDismiss();
    });
  };

  if (dismissed) return <>{children}</>;

  return (
    <Popover open>
      <PopoverAnchor asChild>
        {/* 캡처 단계 클릭 핸들러: ✕든 실제 버튼(이벤트 만들기/링크 복사)이든
            어느 쪽을 눌러도 완료 처리된다. 실제 버튼의 원래 동작은 막지 않는다. */}
        <span onClickCapture={handleDismiss} className="inline-block">
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">{message}</p>
          <button onClick={handleDismiss} aria-label="건너뛰기">
            <X className="h-4 w-4" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- 바깥 클릭으로는 안 닫힌다(`onInteractOutside` 차단) — 실수로 놓치는 것 방지. 닫히는 경로는 ✕ 또는 감싸인 실제 요소 클릭 두 가지뿐.
- "다음" 버튼은 없다 — 실제 버튼을 누르는 행위 자체가 다음 단계로의 이동이다.

**적용 위치**

| 단계 | 위치                                                                      | 문구                                                       |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | `app/dashboard/page.tsx`의 `EventSections` — 빈 상태 "이벤트 만들기" 버튼 | "첫 이벤트를 만들어보세요! 제목과 날짜만 있으면 충분해요." |
| 2    | `app/events/[id]/page.tsx`의 `EventDetailContent` — `CopyLinkButton`      | "이 링크를 복사해서 참여자들에게 공유해보세요!"            |

두 곳 다 이미 필요한 데이터(이벤트 목록, 이벤트 상세)를 그 자리에서 조회하고 있으므로, 별도 서버 컴포넌트 파일 없이 `onboarding_completed_at`과 (2단계는) `getEarliestEventIdByOrganizer` 결과만 같이 조회해 조건부로 감싼다.

## 에러 처리

온보딩은 장식적 기능이라 실패가 본 기능을 막으면 안 된다.

- 대시보드/이벤트 상세 페이지에서 `onboarding_completed_at` 또는 "첫 이벤트 여부" 조회가 실패하면 → 에러를 던지지 않고 온보딩을 그냥 안 보여준다(`false`로 처리).
- `completeOnboardingAction()`이 실패해도(네트워크 문제 등) → 클라이언트는 이미 낙관적으로 닫았으므로 사용자는 체감하지 못한다. 최악의 경우 다음 방문 때 한 번 더 뜨는 정도.
- 인증되지 않은 상태로 `completeOnboardingAction()`이 호출되는 경우(이론상 발생하지 않음) → 조용히 무시.

## 테스트 계획 (Playwright MCP, 수동 검증)

자동화 E2E 스위트에는 넣지 않는다 — 온보딩은 회원가입 직후 1회성 상태라 상시 스위트에 넣으면 계정/데이터가 계속 쌓이고 깨지기 쉽다(Task 4에서 다룬 것과 같은 이유).

1. 새 계정으로 회원가입 → 대시보드 진입 → 빈 상태 "이벤트 만들기" 버튼에 1단계 말풍선이 뜨는지 확인
2. 그 버튼 클릭 → `/events/new`로 정상 이동(클릭이 막히지 않는지) 확인
3. 이벤트 생성 완료 → 상세 페이지의 "링크 복사" 버튼에 2단계 말풍선이 뜨는지 확인
4. 복사 버튼 클릭 → 정상 복사되고(기존 "복사됨!" 동작 유지) 말풍선도 사라지는지 확인
5. DB에서 `onboarding_completed_at`이 채워졌는지 확인
6. 같은 이벤트 상세 페이지 새로고침 → 말풍선이 다시 안 뜨는지 확인(완료 상태 유지)
7. 기존 유저(마이그레이션 백필 대상)로 로그인 → 대시보드에 말풍선이 안 뜨는지 확인(회귀 방지)
8. ✕로 1단계를 건너뛴 시나리오 → 이후 이벤트를 만들어도 2단계 말풍선이 안 뜨는지 확인(하나의 플래그로 전체 종료되는 설계 검증)
9. 두 번째 이벤트를 만든 뒤 그 이벤트 상세 페이지에는 2단계 말풍선이 뜨지 않는지 확인(첫 번째 이벤트에만 붙는지)

## 이번 스코프에서 다루지 않는 것

- 어드민/참여자 대상 온보딩
- 이벤트 생성 폼 화면 자체의 단계별 안내
- 온보딩을 다시 보는 기능(설정/프로필에서 재실행)
- 기존에 쌓인 유저 데이터의 소급 온보딩 노출(마이그레이션이 전원 완료 처리하므로 발생하지 않음)
