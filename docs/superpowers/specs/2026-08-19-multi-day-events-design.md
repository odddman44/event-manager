# 여러 날 모임(날짜 범위) 지원 — 설계 문서

**배경:** `docs/superpowers/backlog-notes.md`의 `#4`. `events.event_date`가 단일 시점(timestamptz) 하나뿐이라 2박3일 캠프 같은 여러 날 모임을 표현할 방법이 없다.

**이번 브레인스토밍에서 확정된 결정:**

- 표시 형식: **"8월 15일 ~ 8월 17일"** (범위 그대로 표기).
- 참여는 **기간 전체 단위**로만 — 특정 날짜만 골라 참여하는 부분 참여 개념은 만들지 않는다.
- 정렬은 기존처럼 시작일(`event_date`) 기준 유지.

## 데이터 모델

- `events`에 `end_date timestamptz null` 추가(nullable — 기존 이벤트는 전부 `null` = 단일 날짜, 마이그레이션 데이터 이관 불필요).
- `src/types/index.ts`의 `Event`에 `end_date: string | null` 추가. `CreateEventDto`/`UpdateEventDto`에도 `end_date?: string`.
- `createEventSchema`(zod)에 `end_date: z.string().optional()` 추가. 폼에서 시작일보다 이전이면 안 되므로 `.refine()`으로 `!end_date || new Date(end_date) >= new Date(event_date)` 검증(에러: "종료일은 시작일 이후여야 합니다").

## 날짜 표시 — 공용 유틸

이벤트 시작/종료일을 함께 렌더링하는 지점(참여 페이지, 대시보드 카드, 이벤트 상세, 어드민 이벤트 목록)에만 새 공용 함수를 쓴다. `created_at`처럼 이벤트 날짜와 무관한 단일 타임스탬프를 찍는 기존 `formatDate`들은 건드리지 않는다(관련 없는 리팩터링 지양).

`src/lib/format-event-date.ts` 신규 파일:

```ts
interface EventDateRange {
  event_date: string;
  end_date: string | null;
}

export function formatEventDate(event: EventDateRange, withTime = true): string;
```

- `end_date`가 없으면 기존과 동일하게 시작일 하나만 포맷.
- `end_date`가 있으면 `"{시작일} ~ {종료일}"`.
- `withTime`으로 시간 포함 여부 제어(어드민 이벤트 목록처럼 날짜만 쓰는 곳도 있어서 — 기존 각 파일의 로케일 옵션 그대로 이관).

적용 대상(각 파일의 기존 로컬 `formatDate` 호출부 중 `event.event_date`를 찍는 곳만 이 함수로 교체 — `created_at` 등 다른 용도는 그대로 둠):

- `components/join-form.tsx`
- `components/event-card.tsx`
- `app/events/[id]/page.tsx`
- `app/admin/(dashboard)/events/page.tsx`

## 이벤트 생성/수정 폼 (`components/event-form.tsx`)

- "날짜 및 시간" 필드 아래에 선택 필드 "종료 날짜 및 시간(선택, 여러 날 모임인 경우)" 추가. 같은 `datetime-local` 패턴, 비워두면 단일 날짜.
- react-hook-form의 zod resolver가 위 `.refine()` 검증을 그대로 처리 — 별도 커스텀 에러 핸들링 불필요.
- `onSubmit`에서 `event_date`와 동일하게 `end_date`도 있을 때만 UTC ISO로 변환해 전달.

## 서비스/리포지토리

`event-service.ts`의 `createEvent`/`updateEvent`가 `input.end_date`를 그대로 리포지토리에 전달(빈 값은 `undefined`로 정규화 — 기존 `emptyToUndefined` 패턴 재사용). `event-repository.ts`의 insert/update 페이로드에 `end_date` 한 줄 추가(기존 `members_only`/`has_password`와 동일한 패턴).

## 이번 스코프에서 다루지 않는 것

- 특정 날짜만 참여하는 부분 참여 — 이번 결정에서 명시적으로 제외.
- 어드민 대시보드 "다가오는 이벤트" 위젯(`app/admin/(dashboard)/page.tsx`)의 날짜 표시 — `TopEvent` 뷰모델이라 범위를 안 태워도 핵심 기능에 영향 없음, 후속 과제로 남김.
- `created_at`/가입일 등 이벤트 날짜와 무관한 기존 `formatDate` 함수들 — 그대로 유지.
