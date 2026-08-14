# 이벤트별 "회원만 참가" 옵션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주최자가 이벤트 생성/수정 시 "회원만 참가 가능" 옵션을 켤 수 있게 하고, 이 옵션이 켜진 이벤트는 비로그인 방문자가 참여 페이지의 "참여 방법 선택" 화면에서 "비회원으로 계속하기" 없이 로그인만 선택할 수 있게 한다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 확장한다. `events.members_only` boolean 컬럼 하나로 표현하고, 클라이언트 UI(선택 화면에서 비회원 버튼 숨김)와 서버(`joinEvent` 서비스의 방어 체크) 양쪽에서 강제한다. `JoinForm`이 이미 `event: Event` 전체 객체를 prop으로 받고 있으므로, 이 필드를 읽기 위한 별도의 `membersOnly` prop은 추가하지 않는다(설계 문서의 표현을 단순화함 — 의도는 동일).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase(Postgres + Auth), react-hook-form + zod, Playwright(수동 MCP 검증 + 자동화 e2e)

**참고 문서:**

- 설계 문서(승인됨): `docs/superpowers/specs/2026-08-14-members-only-events-design.md`
- 백로그: `docs/superpowers/backlog-notes.md`의 `#3`

## Global Constraints

- 코드 주석은 한국어로, **비즈니스 로직(왜 이렇게 했는지)에만** 작성한다. 자명한 코드에 주석을 달지 않는다.
- 들여쓰기 2칸, camelCase 네이밍.
- 커밋 메시지는 한국어 + 이모지 컨벤셔널 커밋 (`✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`). **커밋에 Claude 서명을 넣지 않는다.**
- 기존 코드 스타일을 그대로 따른다. 이 플랜이 요구하지 않은 리팩터링은 하지 않는다.
- 각 Task는 독립 커밋으로 마무리한다.
- 검증은 개발 서버(`npm run dev`, **포트 3001**)를 띄운 상태에서 수행한다. Task 1~2는 Playwright MCP로 수동 검증, Task 3는 자동화된 e2e(`npx playwright test`)로 검증한다. e2e 실행 시 `.env.local`의 `TEST_USER_EMAIL`(`test-user@moija.dev`) 계정이 Supabase에 존재해야 한다 — 없으면 먼저 만들거나 사람에게 확인한다.
- **Playwright MCP 로그인 시 `browser_fill_form`을 쓰지 말 것.** 반드시 `browser_type`을 `#email`, `#password` CSS 셀렉터로 개별 호출한다.
- **`browser_take_screenshot`에 `fullPage: true`를 쓰지 말 것.**
- 모든 Task 종료 시 `npm run typecheck`와 `npm run lint`가 통과해야 한다. `components/event-form.tsx:86`의 react-hooks/incompatible-library 경고 1건은 기존부터 있던 **허용된 baseline**이다. 그 외 새 경고/에러는 허용하지 않는다.
- `joinEvent` 서비스 함수의 `members_only` 서버 방어 체크는 **반드시** 포함해야 한다. UI에서 버튼만 숨기고 서버 체크를 빠뜨리는 코드는 리뷰에서 반려한다.

---

## Task 1: DB 마이그레이션 + 데이터 계층(타입/검증/리포지토리/서비스) 배관

> **배경:** `events` 테이블에 `members_only` 컬럼을 추가하고, 이 값이 타입 시스템·검증 스키마·리포지토리·서비스 레이어를 관통해서 흐르도록 배관한다. 이 Task가 끝나면 아직 사용자에게 보이는 UI 변화는 없지만(체크박스는 Task 2에서 추가), 데이터베이스와 서버 로직은 완전히 준비된 상태가 된다. `joinEvent`의 서버 방어 체크(비회원이 회원제 이벤트에 참여 시도하면 거부)도 이 Task에서 함께 넣는다.

**Files:**

- Create: `supabase/migrations/20260814050000_add_members_only_to_events.sql`
- Modify: `lib/supabase/database.types.ts` (마이그레이션 적용 후 재생성, 직접 손으로 편집하지 않음)
- Modify: `src/types/index.ts`
- Modify: `src/lib/validations.ts`
- Modify: `src/repositories/event-repository.ts`
- Modify: `src/services/event-service.ts`
- Modify: `src/services/participant-service.ts`

**Interfaces:**

- Produces: `Event.members_only: boolean` — `src/types/index.ts`
- Produces: `CreateEventDto.members_only?: boolean`, `UpdateEventDto.members_only?: boolean` — `src/types/index.ts`
- Produces: `createEventSchema`(zod)에 `members_only: z.boolean().optional().default(false)` 필드 추가 — `src/lib/validations.ts`. 이로 인해 `CreateEventInput`(zod로 추론되는 타입)에도 `members_only: boolean`이 자동으로 포함된다.
- Produces: `joinEvent` 서비스 함수가 `event.members_only && !userId`일 때 `Error("이 이벤트는 회원만 참여할 수 있습니다.")`를 던진다 — `src/services/participant-service.ts`

- [ ] **Step 1: 마이그레이션 작성 및 적용**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출한다:

- `name`: `add_members_only_to_events`
- `query`:

```sql
alter table public.events
  add column if not exists members_only boolean not null default false;
```

적용 후 `mcp__supabase__list_migrations`로 마이그레이션이 목록에 나타나는지 확인한다.

- [ ] **Step 2: TypeScript 타입 재생성**

`mcp__supabase__generate_typescript_types` 도구를 호출해 반환된 내용으로 `lib/supabase/database.types.ts` 파일 전체를 덮어쓴다. 파일 내 `events` 테이블 타입에 `members_only: boolean`(Row/Insert/Update 각각)이 포함되어 있는지 확인한다.

- [ ] **Step 3: `Event`/DTO 타입에 `members_only` 추가**

`src/types/index.ts`에서 다음 블록을:

```ts
export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  max_participants: number | null;
  cover_image_url: string | null;
  share_token: string;
  created_at: string;
}
```

다음으로 교체한다:

```ts
export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  max_participants: number | null;
  cover_image_url: string | null;
  members_only: boolean;
  share_token: string;
  created_at: string;
}
```

같은 파일에서 다음 블록을:

```ts
export interface CreateEventDto {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  event_date?: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
}
```

다음으로 교체한다:

```ts
export interface CreateEventDto {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
  members_only?: boolean;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  event_date?: string;
  location?: string;
  max_participants?: number;
  cover_image_url?: string;
  members_only?: boolean;
}
```

- [ ] **Step 4: `createEventSchema`에 `members_only` 추가**

`src/lib/validations.ts`에서 다음 블록을:

```ts
export const createEventSchema = z.object({
  title: z
    .string()
    .min(1, "이벤트 제목을 입력해주세요")
    .max(100, "제목은 100자 이하여야 합니다"),
  description: z.string().max(500, "설명은 500자 이하여야 합니다").optional(),
  event_date: z.string().min(1, "이벤트 날짜를 선택해주세요"),
  location: z.string().max(200, "장소는 200자 이하여야 합니다").optional(),
  max_participants: z
    .number()
    .int("정원은 정수여야 합니다")
    .positive("정원은 1명 이상이어야 합니다")
    .optional(),
});
```

다음으로 교체한다:

```ts
export const createEventSchema = z.object({
  title: z
    .string()
    .min(1, "이벤트 제목을 입력해주세요")
    .max(100, "제목은 100자 이하여야 합니다"),
  description: z.string().max(500, "설명은 500자 이하여야 합니다").optional(),
  event_date: z.string().min(1, "이벤트 날짜를 선택해주세요"),
  location: z.string().max(200, "장소는 200자 이하여야 합니다").optional(),
  max_participants: z
    .number()
    .int("정원은 정수여야 합니다")
    .positive("정원은 1명 이상이어야 합니다")
    .optional(),
  members_only: z.boolean().optional().default(false),
});
```

- [ ] **Step 5: `event-repository.ts`의 `createEvent`/`updateEvent`에 `members_only` 반영**

`src/repositories/event-repository.ts`에서 다음 블록을(`createEvent` 함수 내부):

```ts
    .insert({
      organizer_id: organizerId,
      title: dto.title,
      description: dto.description ?? null,
      event_date: dto.event_date,
      location: dto.location ?? null,
      max_participants: dto.max_participants ?? null,
      cover_image_url: dto.cover_image_url ?? null,
      // share_token은 DB 기본값이 자동 생성
    })
```

다음으로 교체한다:

```ts
    .insert({
      organizer_id: organizerId,
      title: dto.title,
      description: dto.description ?? null,
      event_date: dto.event_date,
      location: dto.location ?? null,
      max_participants: dto.max_participants ?? null,
      cover_image_url: dto.cover_image_url ?? null,
      members_only: dto.members_only ?? false,
      // share_token은 DB 기본값이 자동 생성
    })
```

같은 파일에서 다음 블록을(`updateEvent` 함수 내부):

```ts
    .update({
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.event_date !== undefined && { event_date: dto.event_date }),
      ...(dto.location !== undefined && { location: dto.location ?? null }),
      ...(dto.max_participants !== undefined && {
        max_participants: dto.max_participants ?? null,
      }),
      ...(dto.cover_image_url !== undefined && {
        cover_image_url: dto.cover_image_url ?? null,
      }),
    })
```

다음으로 교체한다:

```ts
    .update({
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.event_date !== undefined && { event_date: dto.event_date }),
      ...(dto.location !== undefined && { location: dto.location ?? null }),
      ...(dto.max_participants !== undefined && {
        max_participants: dto.max_participants ?? null,
      }),
      ...(dto.cover_image_url !== undefined && {
        cover_image_url: dto.cover_image_url ?? null,
      }),
      ...(dto.members_only !== undefined && {
        members_only: dto.members_only,
      }),
    })
```

- [ ] **Step 6: `event-service.ts`의 `createEvent`/`updateEvent`에 `members_only` 반영**

`src/services/event-service.ts`에서 다음 블록을(`createEvent` 함수의 리포지토리 호출부):

```ts
return createEventRepository(supabase, organizerId, {
  title: input.title,
  description: emptyToUndefined(input.description),
  event_date: input.event_date,
  location: emptyToUndefined(input.location),
  max_participants: input.max_participants,
  cover_image_url: coverImageUrl,
});
```

다음으로 교체한다:

```ts
return createEventRepository(supabase, organizerId, {
  title: input.title,
  description: emptyToUndefined(input.description),
  event_date: input.event_date,
  location: emptyToUndefined(input.location),
  max_participants: input.max_participants,
  cover_image_url: coverImageUrl,
  members_only: input.members_only,
});
```

같은 파일에서 다음 블록을(`updateEvent` 함수의 리포지토리 호출부):

```ts
return updateEventRepository(supabase, eventId, {
  title: input.title,
  description: emptyToUndefined(input.description),
  event_date: input.event_date,
  location: emptyToUndefined(input.location),
  max_participants: input.max_participants,
  cover_image_url: coverImageUrl,
});
```

다음으로 교체한다:

```ts
return updateEventRepository(supabase, eventId, {
  title: input.title,
  description: emptyToUndefined(input.description),
  event_date: input.event_date,
  location: emptyToUndefined(input.location),
  max_participants: input.max_participants,
  cover_image_url: coverImageUrl,
  members_only: input.members_only,
});
```

- [ ] **Step 7: `joinEvent` 서버 방어 추가**

`src/services/participant-service.ts`에서 다음 블록을:

```ts
export async function joinEvent(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  // 로그인 사용자가 이 이벤트에 이미 참여한 적이 있다면 새 레코드를 만들지 않는다.
```

다음으로 교체한다:

```ts
export async function joinEvent(
  supabase: SupabaseClient<Database>,
  shareToken: string,
  dto: CreateParticipantDto,
  userId?: string | null,
): Promise<Participant> {
  const event = await getEventByShareTokenRepository(supabase, shareToken);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  // UI(참여 방법 선택 화면)가 비회원 버튼을 숨겨도 서버 액션을 직접 호출하면 우회할
  // 수 있으므로, 회원만 참가 가능한 이벤트는 서버에서도 반드시 막는다.
  if (event.members_only && !userId) {
    throw new Error("이 이벤트는 회원만 참여할 수 있습니다.");
  }

  // 로그인 사용자가 이 이벤트에 이미 참여한 적이 있다면 새 레코드를 만들지 않는다.
```

- [ ] **Step 8: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 9: 마이그레이션 확인**

`mcp__supabase__execute_sql`로 다음을 실행해 컬럼이 정상 추가되고 기본값이 `false`인지 확인한다:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name = 'members_only';
```

`column_default`가 `false`, `is_nullable`이 `NO`여야 한다.

- [ ] **Step 10: 커밋**

```bash
git add supabase/migrations/20260814050000_add_members_only_to_events.sql lib/supabase/database.types.ts src/types/index.ts src/lib/validations.ts src/repositories/event-repository.ts src/services/event-service.ts src/services/participant-service.ts
git commit -m "✨ feat: 이벤트에 회원만 참가 옵션 데이터 계층 추가"
```

---

## Task 2: 이벤트 생성/수정 폼에 "회원만 참가 가능" 체크박스 추가

> **배경:** 주최자가 이벤트를 만들거나 수정할 때 체크박스로 `members_only`를 켤 수 있게 한다. 아직 참여 페이지(Task 3)는 이 값을 쓰지 않으므로, 이 Task 종료 시점에는 "체크박스를 켜고 끄면 DB에 정확히 반영된다"까지만 확인 가능하다.

**Files:**

- Modify: `components/event-form.tsx`
- Modify: `app/events/[id]/edit/page.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**

- Consumes: Task 1의 `Event.members_only`, `CreateEventInput`(zod로 `members_only: boolean` 포함)
- Produces: `tests/e2e/app.spec.ts`의 `createEvent` 헬퍼가 `options.membersOnly?: boolean`을 받도록 확장됨 — Task 3의 e2e 테스트가 이 헬퍼를 재사용한다.

- [ ] **Step 1: `EventFormDefaultValues`에 `members_only` 추가**

`components/event-form.tsx`에서 다음 블록을:

```tsx
interface EventFormDefaultValues {
  title: string;
  description: string;
  event_date: string; // ISO 문자열
  location: string;
  max_participants?: number;
}
```

다음으로 교체한다:

```tsx
interface EventFormDefaultValues {
  title: string;
  description: string;
  event_date: string; // ISO 문자열
  location: string;
  max_participants?: number;
  members_only: boolean;
}
```

- [ ] **Step 2: import 및 `useForm` 구성에 `members_only` 반영**

같은 파일에서 다음 줄을:

```tsx
import { useForm } from "react-hook-form";
```

다음으로 교체한다:

```tsx
import { useForm, Controller } from "react-hook-form";
```

다음 줄을:

```tsx
import { Textarea } from "@/components/ui/textarea";
```

다음으로 교체한다:

```tsx
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
```

다음 블록을:

```tsx
const {
  register,
  handleSubmit,
  watch,
  formState: { errors, isSubmitting },
} = useForm<CreateEventInput>({
  resolver: zodResolver(createEventSchema),
  defaultValues: {
    title: defaultValues?.title ?? "",
    description: defaultValues?.description ?? "",
    event_date: defaultValues?.event_date
      ? toDatetimeLocalValue(defaultValues.event_date)
      : "",
    location: defaultValues?.location ?? "",
    max_participants: defaultValues?.max_participants,
  },
});
```

다음으로 교체한다:

```tsx
const {
  register,
  handleSubmit,
  watch,
  control,
  formState: { errors, isSubmitting },
} = useForm<CreateEventInput>({
  resolver: zodResolver(createEventSchema),
  defaultValues: {
    title: defaultValues?.title ?? "",
    description: defaultValues?.description ?? "",
    event_date: defaultValues?.event_date
      ? toDatetimeLocalValue(defaultValues.event_date)
      : "",
    location: defaultValues?.location ?? "",
    max_participants: defaultValues?.max_participants,
    members_only: defaultValues?.members_only ?? false,
  },
});
```

- [ ] **Step 3: 체크박스 UI 추가**

같은 파일에서 다음 블록(최대 참여자 수 필드 바로 다음, 이벤트 설명 필드 바로 앞) 앞에:

```tsx
      {/* 이벤트 설명 (선택, max 500자) */}
      <div className="space-y-1.5">
        <Label htmlFor="description">이벤트 설명</Label>
```

아래 블록을 삽입한다(즉 "이벤트 설명" 필드 바로 위에 추가):

```tsx
      {/* 회원만 참가 가능 (선택) */}
      <div className="flex items-center gap-2">
        <Controller
          name="members_only"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="members_only"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="members_only" className="cursor-pointer font-normal">
          회원만 참가 가능
        </Label>
      </div>

      {/* 이벤트 설명 (선택, max 500자) */}
      <div className="space-y-1.5">
        <Label htmlFor="description">이벤트 설명</Label>
```

- [ ] **Step 4: 수정 페이지가 기존 값을 넘기도록 수정**

`app/events/[id]/edit/page.tsx`에서 다음 블록을:

```tsx
          defaultValues={{
            title: event.title,
            description: event.description ?? "",
            event_date: event.event_date,
            location: event.location ?? "",
            max_participants: event.max_participants ?? undefined,
          }}
```

다음으로 교체한다:

```tsx
          defaultValues={{
            title: event.title,
            description: event.description ?? "",
            event_date: event.event_date,
            location: event.location ?? "",
            max_participants: event.max_participants ?? undefined,
            members_only: event.members_only,
          }}
```

- [ ] **Step 5: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: `createEvent` 테스트 헬퍼 확장**

`tests/e2e/app.spec.ts`에서 다음 블록을:

```ts
async function createEvent(
  page: Page,
  options: { maxParticipants?: number } = {},
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
  await page.getByRole("button", { name: "이벤트 만들기" }).click();
```

다음으로 교체한다:

```ts
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
```

- [ ] **Step 7: 체크박스 왕복 e2e 테스트 추가**

같은 파일의 `"이벤트 관리 /events/{id}"` describe 블록 안에서, 다음 블록을:

```ts
  test("참여자가 없으면 안내 문구가 표시된다", async ({ page }) => {
    await createEvent(page);
    await expect(page.getByText("참여자 목록")).toBeVisible();
    await expect(page.getByText("아직 참여자가 없습니다.")).toBeVisible();
  });
});
```

다음으로 교체한다(새 테스트를 그 사이에 추가):

```ts
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
```

- [ ] **Step 8: 신규 테스트 실행 확인**

```bash
npx playwright test tests/e2e/app.spec.ts -g "회원만 참가 체크박스"
```

통과해야 한다.

- [ ] **Step 9: 커밋**

```bash
git add components/event-form.tsx "app/events/[id]/edit/page.tsx" tests/e2e/app.spec.ts
git commit -m "✨ feat: 이벤트 생성/수정 폼에 회원만 참가 체크박스 추가"
```

---

## Task 3: 참여 페이지 회원제 처리 + 전체 회귀 검증

> **배경:** 참여 페이지의 "참여 방법 선택" 화면이 `event.members_only`를 실제로 반영하도록 만들고, 관련 e2e 시나리오를 추가한 뒤 전체 스위트로 회귀를 확인한다.

**Files:**

- Modify: `components/join-form.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**

- Consumes: Task 1의 `Event.members_only`(이미 `JoinFormProps.event: Event`로 전달되고 있음 — 새 prop 불필요), Task 2에서 확장된 `createEvent(page, { membersOnly })` 테스트 헬퍼

- [ ] **Step 1: choice 화면에서 회원제 이벤트는 비회원 버튼을 숨기고 안내 문구를 보여준다**

`components/join-form.tsx`에서 다음 블록을:

```tsx
{
  /* State 0: 로그인/비회원 선택 (비로그인 방문자만) */
}
{
  state === "choice" && (
    <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-800">참여 방법 선택</h2>
      <Button
        className="bg-primary hover:bg-primary/90 w-full text-white"
        onClick={() =>
          router.push(
            `/auth/login?redirect=${encodeURIComponent(`/join/${shareToken}`)}`,
          )
        }
      >
        로그인하고 참여하기
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setState("form")}
      >
        비회원으로 계속하기
      </Button>
    </div>
  );
}
```

다음으로 교체한다:

```tsx
{
  /* State 0: 로그인/비회원 선택 (비로그인 방문자만) */
}
{
  state === "choice" && (
    <div className="rounded-card space-y-3 border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-800">참여 방법 선택</h2>
      <Button
        className="bg-primary hover:bg-primary/90 w-full text-white"
        onClick={() =>
          router.push(
            `/auth/login?redirect=${encodeURIComponent(`/join/${shareToken}`)}`,
          )
        }
      >
        로그인하고 참여하기
      </Button>
      {event.members_only ? (
        <p className="text-center text-sm text-gray-500">
          이 모임은 회원만 참여할 수 있어요
        </p>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setState("form")}
        >
          비회원으로 계속하기
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입/린트 검증**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 3: e2e 시나리오 3건 추가**

`tests/e2e/app.spec.ts`의 `"참여 페이지 /join/{share_token}"` describe 블록 안에서, 다음 블록을(마지막 테스트 바로 다음, 블록을 닫는 `});` 바로 앞):

```ts
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
});
```

다음으로 교체한다(끝에 테스트 3개 추가):

```ts
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
});
```

- [ ] **Step 4: 신규 테스트만 먼저 실행 확인**

```bash
npx playwright test tests/e2e/app.spec.ts -g "회원만"
```

3개 모두 통과해야 한다.

- [ ] **Step 5: 전체 품질 게이트 + 전체 e2e 스위트**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
npx playwright test
```

`components/event-form.tsx:86` 경고 1건 외 새 경고/에러가 없어야 한다. e2e는 **전부 통과**해야 한다(정확한 개수는 이전 플랜 이후 누적된 스위트 크기에 따라 달라질 수 있음 — 실패 0건이 기준).

- [ ] **Step 6: 커밋**

```bash
git add components/join-form.tsx tests/e2e/app.spec.ts
git commit -m "✨ feat: 참여 페이지에 회원만 참가 이벤트 처리 추가"
```

- [ ] **Step 7: 백로그 노트 갱신**

`docs/superpowers/backlog-notes.md`에서 다음 줄을:

```markdown
## #3: 이벤트 "회원만 참가 가능" 옵션
```

다음으로 교체한다:

```markdown
## #3: 이벤트 "회원만 참가 가능" 옵션 ✅ 완료

> 설계: `docs/superpowers/specs/2026-08-14-members-only-events-design.md`
> 플랜: `docs/superpowers/plans/2026-08-14-members-only-events.md`
```

- [ ] **Step 8: 포맷 검증 및 커밋**

```bash
npm run format:check
git add docs/superpowers/backlog-notes.md
git commit -m "📝 docs: 백로그 #3(회원만 참가 옵션) 완료 처리"
```

---

## 부록: 이번 스코프에서 다루지 않은 것

- `#5`/`#6`(참여자 목록 공개), `#7`(이벤트 암호 보호), `#4`(날짜 범위 모임 지원), `#8`(로그인 시 헤더 노출) — 백로그 노트 참고, 다음 순서로 별도 브레인스토밍.
- `#9`(작성자 자기 링크 감지), `#10`(닉네임 참여) — 이번 설계 문서에서 "변경 불필요"로 결론.
