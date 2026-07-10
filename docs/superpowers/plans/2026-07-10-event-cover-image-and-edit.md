# 이벤트 커버 이미지 업로드 + 이벤트 수정 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이벤트에 커버 이미지를 업로드할 수 있게 하고, 지금까지 없던 "이벤트 수정" 기능을 신설해 제목/날짜/장소/정원/설명/커버이미지를 모두 수정할 수 있게 만든다.

**Architecture:** 기존 레이어드 아키텍처(Controller → Service → Repository)를 그대로 확장한다. 이미지 바이너리는 Supabase Storage의 신규 public 버킷 `event-covers`에 저장하고, `events.cover_image_url`에는 공개 URL 문자열만 저장한다. `EventForm` 컴포넌트를 생성/수정 공용으로 리팩터링해 중복 없이 두 플로우를 지원한다.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres + Storage), react-hook-form + zod, Tailwind

**참고 스펙 문서:** `docs/superpowers/specs/2026-07-10-event-cover-image-design.md`

## Global Constraints

- 커버 이미지: JPG/PNG/WebP만 허용, 최대 5MB. 클라이언트(즉시 피드백)와 서버(재검증) 양쪽에서 검증.
- Storage 버킷 `event-covers`는 **public** 버킷 (참여 페이지가 비로그인 접근이라 signed URL 방식은 부적합).
- 저장 경로 규칙: `{organizer_id}/{random-uuid}.{ext}`
- 이미지 교체 시 기존 파일 삭제는 하지 않음 (스코프 밖).
- 어드민 화면은 이번 스코프에서 제외.
- 코드 주석은 한국어로, 비즈니스 로직(왜 이렇게 했는지)에만 작성.
- 들여쓰기 2칸, camelCase 네이밍 (기존 코드 스타일 그대로 따름).

---

### Task 1: DB 스키마 & Storage 버킷 준비

**Files:**

- Migration 1 (컬럼 추가): `mcp__supabase__apply_migration` 도구로 적용 (로컬 `supabase/migrations/`에도 자동 기록됨)
- Migration 2 (버킷 + RLS): 동일하게 `mcp__supabase__apply_migration` 도구로 적용
- Modify: `lib/supabase/database.types.ts` (타입 재생성으로 덮어씀)

**Interfaces:**

- Produces: `events.cover_image_url` 컬럼 (nullable text), Storage 버킷 `event-covers` (public, 5MB 제한, jpeg/png/webp만 허용)

- [ ] **Step 1: `events` 테이블에 `cover_image_url` 컬럼 추가**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출:

```
name: add_cover_image_url_to_events
query:
alter table public.events add column cover_image_url text;

comment on column public.events.cover_image_url is '이벤트 커버 이미지의 Supabase Storage 공개 URL. null이면 기본 이미지로 대체 표시';
```

- [ ] **Step 2: `event-covers` Storage 버킷 + RLS 정책 생성**

`mcp__supabase__apply_migration` 도구를 다음 인자로 호출:

```
name: create_event_covers_storage_bucket
query:
-- 이벤트 커버 이미지 전용 public 버킷 (참여 페이지는 비로그인 접근이라 signed URL 대신 공개 URL 사용)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- 업로드는 인증된 사용자가 자기 uid 폴더 아래에만 가능 (경로: {organizer_id}/{uuid}.{ext})
create policy "이벤트 커버 이미지 업로드 - 본인 폴더만"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT는 버킷이 public이라 별도 정책 없이 공개 URL로 조회 가능 (정책 생성 안 함)
-- UPDATE/DELETE 정책도 생성하지 않음 (교체 시 새 파일 업로드, 기존 파일 삭제는 스코프 밖)
```

- [ ] **Step 3: TypeScript 타입 재생성**

`mcp__supabase__generate_typescript_types` 도구를 호출하고, 반환된 내용으로 `lib/supabase/database.types.ts` 전체를 덮어쓴다.

- [ ] **Step 4: 확인**

`lib/supabase/database.types.ts`의 `events.Row`/`Insert`/`Update`에 `cover_image_url: string | null`(Row) / `cover_image_url?: string | null`(Insert, Update)이 포함됐는지 확인.

```bash
grep -n "cover_image_url" lib/supabase/database.types.ts
```

Expected: 3곳(Row/Insert/Update) 모두 매칭.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations lib/supabase/database.types.ts
git commit -m "이벤트 커버 이미지용 컬럼 및 Storage 버킷 추가"
```

---

### Task 2: 타입 및 검증 함수 확장

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/lib/validations.ts`

**Interfaces:**

- Produces: `Event.cover_image_url: string | null`, `CreateEventDto.cover_image_url?: string`, `UpdateEventDto.cover_image_url?: string`, `validateCoverImage(file: File): string | null`

- [ ] **Step 1: `src/types/index.ts`에 `cover_image_url` 필드 추가**

`src/types/index.ts:15-25`의 `Event` 인터페이스를 수정:

```typescript
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

`src/types/index.ts:39-53`의 DTO들을 수정:

```typescript
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

- [ ] **Step 2: `validateCoverImage` 함수 추가**

`src/lib/validations.ts` 맨 아래(export type들 앞)에 추가:

```typescript
const MAX_COVER_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_COVER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// <input type="file">는 FileList를 다뤄 zodResolver와 궁합이 안 좋아 별도 함수로 분리
// (클라이언트 즉시 피드백 + 서버 재검증 양쪽에서 재사용)
export function validateCoverImage(file: File): string | null {
  if (!ALLOWED_COVER_IMAGE_TYPES.includes(file.type)) {
    return "JPG, PNG, WebP 형식의 이미지만 업로드할 수 있습니다.";
  }
  if (file.size > MAX_COVER_IMAGE_SIZE) {
    return "이미지 크기는 5MB 이하여야 합니다.";
  }
  return null;
}
```

- [ ] **Step 3: 타입 체크로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음 (아직 `cover_image_url`을 참조하는 곳이 없으므로 기존 코드는 그대로 통과).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/validations.ts
git commit -m "이벤트 타입/DTO에 커버 이미지 필드 추가, 이미지 검증 함수 작성"
```

---

### Task 3: Repository 확장 — 업로드 및 수정

**Files:**

- Modify: `src/repositories/event-repository.ts`

**Interfaces:**

- Consumes: `CreateEventDto`, `UpdateEventDto` (Task 2에서 확장됨), `SupabaseClient<Database>`
- Produces: `uploadCoverImage(supabase, organizerId, file): Promise<string>`, `updateEvent(supabase, eventId, dto): Promise<Event>`, 확장된 `createEvent(...)` (cover_image_url 포함)

- [ ] **Step 1: `createEvent`가 `cover_image_url`도 insert하도록 수정**

`src/repositories/event-repository.ts:14-33`의 `createEvent` 함수를 수정:

```typescript
export async function createEvent(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  dto: CreateEventDto,
): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
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
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "이벤트 생성에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 2: `uploadCoverImage` 함수 추가**

`src/repositories/event-repository.ts`의 import 구문을 수정 (`CreateEventDto` 옆에 `UpdateEventDto` 추가):

```typescript
import type {
  CreateEventDto,
  UpdateEventDto,
  Event,
  EventWithParticipantCount,
  Participant,
} from "../types";
```

`createEvent` 함수 바로 다음에 추가:

```typescript
export async function uploadCoverImage(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${organizerId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("event-covers")
    .upload(path, file);

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 3: `updateEvent` 함수 추가**

파일 끝(`listParticipantsByEvent` 함수 뒤)에 추가:

```typescript
export async function updateEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
  dto: UpdateEventDto,
): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
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
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "이벤트 수정에 실패했습니다.");
  }
  return data;
}
```

- [ ] **Step 4: 타입 체크로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/event-repository.ts
git commit -m "event-repository에 커버 이미지 업로드 및 이벤트 수정 함수 추가"
```

---

### Task 4: Service 확장 — 생성 시 업로드, 수정 서비스 신설

**Files:**

- Modify: `src/services/event-service.ts`

**Interfaces:**

- Consumes: `uploadCoverImage`, `updateEvent`, `createEvent`, `getEventById`(repository, Task 3), `validateCoverImage`(Task 2)
- Produces: 확장된 `createEvent(supabase, organizerId, input, coverImageFile?): Promise<Event>`, 신규 `updateEvent(supabase, eventId, organizerId, input, coverImageFile?): Promise<Event>`

- [ ] **Step 1: import 구문 수정**

`src/services/event-service.ts:1-11`을 수정:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateEventInput } from "../lib/validations";
import { validateCoverImage } from "../lib/validations";
import type { Event, EventWithParticipantCount, Participant } from "../types";
import {
  createEvent as createEventRepository,
  updateEvent as updateEventRepository,
  uploadCoverImage as uploadCoverImageRepository,
  listEventsByOrganizer as listEventsByOrganizerRepository,
  getEventById as getEventByIdRepository,
  listParticipantsByEvent as listParticipantsByEventRepository,
  deleteEvent as deleteEventRepository,
} from "../repositories/event-repository";
```

- [ ] **Step 2: `createEvent`가 커버 이미지 파일을 받도록 확장**

`src/services/event-service.ts:17-29`의 `createEvent` 함수를 수정:

```typescript
export async function createEvent(
  supabase: SupabaseClient<Database>,
  organizerId: string,
  input: CreateEventInput,
  coverImageFile?: File,
): Promise<Event> {
  let coverImageUrl: string | undefined;
  if (coverImageFile) {
    const validationError = validateCoverImage(coverImageFile);
    if (validationError) {
      throw new Error(validationError);
    }
    coverImageUrl = await uploadCoverImageRepository(
      supabase,
      organizerId,
      coverImageFile,
    );
  }

  return createEventRepository(supabase, organizerId, {
    title: input.title,
    description: emptyToUndefined(input.description),
    event_date: input.event_date,
    location: emptyToUndefined(input.location),
    max_participants: input.max_participants,
    cover_image_url: coverImageUrl,
  });
}
```

- [ ] **Step 3: `updateEvent` 서비스 함수 신설**

파일 끝(`deleteEvent` 함수 뒤)에 추가:

```typescript
// 주최자 본인이 아니면 에러 (getEventDetail과 동일한 소유자 검증 패턴)
export async function updateEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
  organizerId: string,
  input: CreateEventInput,
  coverImageFile?: File,
): Promise<Event> {
  const event = await getEventByIdRepository(supabase, eventId);
  if (!event || event.organizer_id !== organizerId) {
    throw new Error("이벤트를 찾을 수 없습니다.");
  }

  let coverImageUrl = event.cover_image_url ?? undefined;
  if (coverImageFile) {
    const validationError = validateCoverImage(coverImageFile);
    if (validationError) {
      throw new Error(validationError);
    }
    coverImageUrl = await uploadCoverImageRepository(
      supabase,
      organizerId,
      coverImageFile,
    );
  }

  return updateEventRepository(supabase, eventId, {
    title: input.title,
    description: emptyToUndefined(input.description),
    event_date: input.event_date,
    location: emptyToUndefined(input.location),
    max_participants: input.max_participants,
    cover_image_url: coverImageUrl,
  });
}
```

- [ ] **Step 4: 타입 체크로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add src/services/event-service.ts
git commit -m "event-service에 커버 이미지 업로드 처리 및 이벤트 수정 서비스 추가"
```

---

### Task 5: Controller 확장 — Server Action 신설

**Files:**

- Modify: `src/controllers/event-controller.ts`

**Interfaces:**

- Consumes: `createEvent`, `updateEvent`(service, Task 4)
- Produces: 확장된 `createEventAction(input, coverImage?)`, 신규 `updateEventAction(eventId, input, coverImage?)`

- [ ] **Step 1: import 구문 및 `createEventAction` 확장**

`src/controllers/event-controller.ts` 전체를 다음으로 교체:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEventSchema, type CreateEventInput } from "../lib/validations";
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
} from "../services/event-service";

type EventActionResult = { success: false; error: string };

export async function createEventAction(
  input: CreateEventInput,
  coverImage?: File,
): Promise<EventActionResult | void> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub;
  if (!organizerId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  let event;
  try {
    event = await createEventService(
      supabase,
      organizerId,
      parsed.data,
      coverImage,
    );
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "이벤트 생성 중 오류가 발생했습니다.",
    };
  }

  redirect(`/events/${event.id}`);
}

export async function updateEventAction(
  eventId: string,
  input: CreateEventInput,
  coverImage?: File,
): Promise<EventActionResult | void> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub;
  if (!organizerId) {
    return { success: false, error: "로그인이 필요합니다." };
  }

  try {
    await updateEventService(
      supabase,
      eventId,
      organizerId,
      parsed.data,
      coverImage,
    );
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "이벤트 수정 중 오류가 발생했습니다.",
    };
  }

  redirect(`/events/${eventId}`);
}
```

(참고: 기존 `CreateEventResult` 타입명을 `EventActionResult`로 바꿔 두 액션이 공유하도록 함 — 이 타입은 이 파일 밖에서 import되지 않으므로 이름 변경이 안전함)

- [ ] **Step 2: 타입 체크로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/controllers/event-controller.ts
git commit -m "event-controller에 이벤트 수정 Server Action 추가"
```

---

### Task 6: 기본 커버 이미지 및 이미지 도메인 설정

**Files:**

- Create: `public/images/default-event-cover.svg`
- Modify: `next.config.ts`

**Interfaces:**

- Produces: 정적 자산 `/images/default-event-cover.svg`, `next.config.ts`의 Supabase Storage 호스트 허용

- [ ] **Step 1: 기본 커버 이미지 SVG 생성**

```bash
mkdir -p public/images
```

`public/images/default-event-cover.svg` 생성:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#FF6B35"/>
  <g transform="translate(320,155)" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="0" y="20" width="160" height="120" rx="12" fill="#FFFFFF" fill-opacity="0.15"/>
    <line x1="0" y1="56" x2="160" y2="56"/>
    <line x1="36" y1="0" x2="36" y2="36"/>
    <line x1="124" y1="0" x2="124" y2="36"/>
  </g>
</svg>
```

- [ ] **Step 2: Supabase Storage 호스트를 이미지 허용 도메인에 추가**

`next.config.ts`를 수정 (기존 `remotePatterns` 배열에 추가):

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "pwgfymfapzvqiolgtabd.supabase.co",
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 3: 빌드로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음. (이미지 도메인 오류는 런타임에만 나타나므로, Task 9에서 실제 페이지 렌더링 시 다시 확인)

- [ ] **Step 4: Commit**

```bash
git add public/images/default-event-cover.svg next.config.ts
git commit -m "기본 이벤트 커버 이미지 및 Supabase Storage 이미지 도메인 추가"
```

---

### Task 7: EventForm 리팩터링 — 생성/수정 공용 + 업로드 UI

**Files:**

- Modify: `components/event-form.tsx`

**Interfaces:**

- Consumes: `createEventAction`, `updateEventAction`(Task 5), `validateCoverImage`(Task 2)
- Produces: `EventForm(props: EventFormProps)` — `mode`, `eventId`, `defaultValues`, `existingCoverImageUrl` prop 지원. 기존 `<EventForm />`(prop 없음)은 `mode: "create"` 기본값으로 그대로 동작.

- [ ] **Step 1: `components/event-form.tsx` 전체를 다음으로 교체**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createEventSchema,
  validateCoverImage,
  type CreateEventInput,
} from "@/src/lib/validations";
import {
  createEventAction,
  updateEventAction,
} from "@/src/controllers/event-controller";

interface EventFormDefaultValues {
  title: string;
  description: string;
  event_date: string; // ISO 문자열
  location: string;
  max_participants?: number;
}

interface EventFormProps {
  mode?: "create" | "edit";
  eventId?: string;
  defaultValues?: EventFormDefaultValues;
  existingCoverImageUrl?: string | null;
}

// datetime-local input은 값을 브라우저 로컬 타임존으로 해석하므로,
// 서비스 전역에서 KST로 고정 표시하는 기존 방식(formatDate들)과 일관되게
// ISO 문자열을 KST 기준 "YYYY-MM-DDTHH:mm"으로 변환해 프리필한다.
function toDatetimeLocalValue(isoString: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default function EventForm({
  mode = "create",
  eventId,
  defaultValues,
  existingCoverImageUrl,
}: EventFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingCoverImageUrl ?? null,
  );

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

  const description = watch("description") ?? "";

  // 미리보기용 blob: URL은 컴포넌트가 언마운트되거나 새 파일로 교체될 때 해제
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const validationError = validateCoverImage(file);
    if (validationError) {
      setCoverImageError(validationError);
      return;
    }
    setCoverImageError(null);
    setCoverImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function onSubmit(data: CreateEventInput) {
    setServerError(null);
    const payload = {
      ...data,
      // datetime-local 값은 타임존 정보가 없어 브라우저 로컬 시간대로 해석되므로 UTC ISO 문자열로 변환
      event_date: new Date(data.event_date).toISOString(),
    };

    const result =
      mode === "edit" && eventId
        ? await updateEventAction(eventId, payload, coverImageFile ?? undefined)
        : await createEventAction(payload, coverImageFile ?? undefined);

    if (result?.success === false) {
      setServerError(result.error);
    }
    // 성공 시 서버 액션 내부 redirect()가 네비게이션을 처리
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* 이벤트 제목 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          이벤트 제목 <span className="text-primary">*</span>
        </Label>
        <Input
          id="title"
          placeholder="예: 개발자 밋업"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-sm text-red-500">{errors.title.message}</p>
        )}
      </div>

      {/* 날짜 및 시간 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="event_date">
          날짜 및 시간 <span className="text-primary">*</span>
        </Label>
        <Input
          id="event_date"
          type="datetime-local"
          {...register("event_date")}
        />
        {errors.event_date && (
          <p className="text-sm text-red-500">{errors.event_date.message}</p>
        )}
      </div>

      {/* 장소 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="location">장소</Label>
        <Input
          id="location"
          placeholder="예: 서울 강남구 COEX (선택)"
          {...register("location")}
        />
        {errors.location && (
          <p className="text-sm text-red-500">{errors.location.message}</p>
        )}
      </div>

      {/* 최대 참여자 수 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="max_participants">최대 참여자 수</Label>
        <Input
          id="max_participants"
          type="number"
          min="1"
          placeholder="제한 없음"
          {...register("max_participants", {
            setValueAs: (v) => (v === "" ? undefined : Number(v)),
          })}
        />
        {errors.max_participants && (
          <p className="text-sm text-red-500">
            {errors.max_participants.message}
          </p>
        )}
      </div>

      {/* 이벤트 설명 (선택, max 500자) */}
      <div className="space-y-1.5">
        <Label htmlFor="description">이벤트 설명</Label>
        <Textarea
          id="description"
          placeholder="이벤트에 대해 간단히 소개해주세요."
          maxLength={500}
          rows={4}
          {...register("description")}
        />
        <p className="text-muted-foreground text-right text-xs">
          {description.length} / 500자
        </p>
        {errors.description && (
          <p className="text-sm text-red-500">{errors.description.message}</p>
        )}
      </div>

      {/* 커버 이미지 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="coverImage">커버 이미지</Label>
        {previewUrl && (
          <div className="bg-muted relative mb-2 h-32 w-full overflow-hidden rounded-md">
            <Image
              src={previewUrl}
              alt="커버 이미지 미리보기"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        <Input
          id="coverImage"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleCoverImageChange}
        />
        <p className="text-muted-foreground text-xs">
          JPG, PNG, WebP / 최대 5MB
        </p>
        {coverImageError && (
          <p className="text-sm text-red-500">{coverImageError}</p>
        )}
      </div>

      {/* 서버 에러 메시지 영역 */}
      {serverError && <p className="text-sm text-red-500">{serverError}</p>}

      {/* 버튼 영역 */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90 flex-1 text-white"
        >
          {isSubmitting
            ? mode === "edit"
              ? "수정 중..."
              : "생성 중..."
            : mode === "edit"
              ? "수정 완료"
              : "이벤트 만들기"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" asChild>
          <Link
            href={
              mode === "edit" && eventId ? `/events/${eventId}` : "/dashboard"
            }
          >
            취소
          </Link>
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: 타입 체크로 확인**

```bash
npm run typecheck
```

Expected: 에러 없음. (`app/events/new/page.tsx`의 `<EventForm />`는 prop 없이 호출되므로 `mode` 기본값 `"create"`로 그대로 동작해야 함)

- [ ] **Step 3: Commit**

```bash
git add components/event-form.tsx
git commit -m "EventForm을 생성/수정 공용 컴포넌트로 리팩터링하고 커버 이미지 업로드 UI 추가"
```

---

### Task 8: 이벤트 수정 페이지 신설 + 관리 페이지 "수정" 버튼

**Files:**

- Create: `app/events/[id]/edit/page.tsx`
- Modify: `app/events/[id]/page.tsx`

**Interfaces:**

- Consumes: `getEventDetail`(기존 서비스, 소유자 검증 포함), `EventForm`(Task 7)

- [ ] **Step 1: 이벤트 수정 페이지 생성**

`app/events/[id]/edit/page.tsx` 생성:

```tsx
import { redirect } from "next/navigation";
import EventForm from "@/components/event-form";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/src/services/event-service";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const organizerId = data?.claims?.sub as string;

  const detail = await getEventDetail(supabase, id, organizerId);
  if (!detail) {
    redirect("/dashboard");
  }
  const { event } = detail;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">이벤트 수정</h1>

      <div className="rounded-card bg-card border p-6 shadow-sm">
        <EventForm
          mode="edit"
          eventId={event.id}
          defaultValues={{
            title: event.title,
            description: event.description ?? "",
            event_date: event.event_date,
            location: event.location ?? "",
            max_participants: event.max_participants ?? undefined,
          }}
          existingCoverImageUrl={event.cover_image_url}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 관리 페이지에 "수정" 버튼 추가**

`app/events/[id]/page.tsx`에서 import 구문에 `Link`와 `Button` 추가 (`import { Badge } from "@/components/ui/badge";` 다음 줄에):

```tsx
import { Button } from "@/components/ui/button";
import Link from "next/link";
```

`app/events/[id]/page.tsx:56-58`의 이벤트 정보 카드 상단부를 수정:

```tsx
      {/* a) 이벤트 정보 카드 */}
      <div className="rounded-card bg-card overflow-hidden border p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`/events/${event.id}/edit`}>수정</Link>
          </Button>
        </div>
```

(바로 다음에 있던 기존 `<h1 className="mb-4 text-2xl font-bold">{event.title}</h1>` 한 줄은 위 블록으로 대체되어 삭제됨)

- [ ] **Step 3: 개발 서버로 확인**

```bash
npm run dev
```

브라우저에서 로그인 후 `/events/{내 이벤트 id}` 접속 → "수정" 버튼 클릭 → `/events/{id}/edit`로 이동하며 기존 값(제목/날짜/장소/정원/설명)이 프리필되는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/events/[id]/edit/page.tsx app/events/[id]/page.tsx
git commit -m "이벤트 수정 페이지 신설 및 관리 페이지에 수정 버튼 추가"
```

---

### Task 9: 커버 이미지 노출 — 대시보드/관리 페이지/참여 페이지

**Files:**

- Modify: `app/dashboard/page.tsx`
- Modify: `app/events/[id]/page.tsx`
- Modify: `components/join-form.tsx`

**Interfaces:**

- Consumes: `Event.cover_image_url`(Task 2), `/images/default-event-cover.svg`(Task 6)

- [ ] **Step 1: 대시보드 이벤트 카드에 커버 이미지 추가**

`app/dashboard/page.tsx` 상단 import에 `Image` 추가:

```tsx
import Image from "next/image";
```

`app/dashboard/page.tsx:76-89`의 카드 내부, `<div className="mb-3 flex items-start justify-between gap-2">` 바로 앞에 추가:

```tsx
<div className="bg-muted relative mb-3 h-32 w-full overflow-hidden rounded-md">
  <Image
    src={event.cover_image_url ?? "/images/default-event-cover.svg"}
    alt={event.title}
    fill
    className="object-cover"
  />
</div>
```

- [ ] **Step 2: 이벤트 관리 페이지 상단에 커버 이미지 추가**

`app/events/[id]/page.tsx` 상단 import에 `Image` 추가:

```tsx
import Image from "next/image";
```

`app/events/[id]/page.tsx`의 이벤트 정보 카드(Task 8에서 수정한 블록) 바로 위, `<div className="rounded-card bg-card overflow-hidden border p-6 shadow-sm">` 여는 태그 다음 줄에 추가:

```tsx
<div className="bg-muted relative -mx-6 -mt-6 mb-4 h-40 w-[calc(100%+3rem)]">
  <Image
    src={event.cover_image_url ?? "/images/default-event-cover.svg"}
    alt={event.title}
    fill
    className="object-cover"
  />
</div>
```

(카드에 이미 `p-6` 패딩이 있어 배너를 카드 폭 전체로 채우기 위해 음수 마진으로 패딩을 상쇄함 — `overflow-hidden`이 이미 카드에 걸려 있어 튀어나오지 않음)

- [ ] **Step 3: 참여 페이지 상단에 커버 이미지 추가**

`components/join-form.tsx` 상단 import에 `Image` 추가 (`import { useEffect, useState } from "react";` 다음 줄):

```tsx
import Image from "next/image";
```

`components/join-form.tsx:56-82`의 `EventInfoCard` 함수를 수정:

```tsx
function EventInfoCard({
  event,
  registeredCount,
}: {
  event: Event;
  registeredCount: number;
}) {
  return (
    <div className="rounded-card overflow-hidden border border-gray-100 bg-white shadow-sm">
      <div className="relative h-40 w-full bg-gray-100">
        <Image
          src={event.cover_image_url ?? "/images/default-event-cover.svg"}
          alt={event.title}
          fill
          className="object-cover"
        />
      </div>
      <div className="space-y-3 p-4">
        <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary size-4 shrink-0" />
            <span>{formatDate(event.event_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-primary size-4 shrink-0" />
            <span>{event.location ?? "장소 미정"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="text-primary size-4 shrink-0" />
            <span>
              {registeredCount}
              {event.max_participants !== null
                ? ` / ${event.max_participants}명`
                : "명 (정원 제한 없음)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 개발 서버로 확인**

```bash
npm run dev
```

브라우저에서 이미지 없는 기존 이벤트로 대시보드/관리 페이지/참여 페이지(`/join/{share_token}`) 3곳 모두 기본 이미지(`#FF6B35` 배경의 캘린더 아이콘)가 표시되는지 확인.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/events/[id]/page.tsx components/join-form.tsx
git commit -m "대시보드/관리 페이지/참여 페이지에 이벤트 커버 이미지 노출"
```

---

### Task 10: 통합 검증 (Playwright MCP)

**Files:** 없음 (수동 브라우저 검증)

이 태스크는 스펙 문서의 "테스트 계획" 섹션을 그대로 수행한다. Playwright MCP 브라우저 도구(`mcp__playwright__browser_navigate`, `browser_click`, `browser_file_upload`, `browser_snapshot` 등)로 아래 시나리오를 순서대로 검증한다.

- [ ] **Step 1: 이미지 없이 이벤트 생성 → 기본 이미지 노출 확인**

`/events/new`에서 이미지 없이 필수값만 입력해 생성 → 대시보드 카드, 관리 페이지(`/events/{id}`), 참여 페이지(`/join/{share_token}`) 3곳 모두 `default-event-cover.svg`가 보이는지 확인.

- [ ] **Step 2: 이미지 업로드하며 이벤트 생성 → 실제 이미지 반영 확인**

`/events/new`에서 JPG/PNG 이미지를 업로드해 생성 → 3곳 모두 업로드한 이미지가 표시되는지 확인 (Supabase Storage 공개 URL로 로드됨).

- [ ] **Step 3: 이벤트 수정 → 프리필 및 반영 확인**

Step 2에서 만든 이벤트의 관리 페이지에서 "수정" 클릭 → `/events/{id}/edit`에서 제목/날짜/장소/정원/설명/기존 커버 이미지가 프리필되어 있는지 확인 → 제목과 커버 이미지를 변경 후 저장 → 관리 페이지로 리다이렉트되며 변경사항이 반영됐는지 확인.

- [ ] **Step 4: 잘못된 파일 업로드 시 클라이언트 에러 확인**

수정 또는 생성 폼에서 5MB 초과 파일 또는 PDF 등 허용되지 않는 형식을 선택 → 제출 전에 클라이언트 에러 메시지가 즉시 표시되는지 확인 (서버 요청 없이).

- [ ] **Step 5: 타 사용자 접근 차단 확인**

다른 사용자 계정으로 로그인한 상태에서 Step 2 이벤트의 `/events/{id}/edit`에 직접 접근 → `/dashboard`로 리다이렉트되는지 확인.

- [ ] **Step 6: 전체 린트/타입 체크로 마무리**

```bash
npm run lint
npm run typecheck
```

Expected: 둘 다 에러 없음.

- [ ] **Step 7: ROADMAP 업데이트**

`docs/ROADMAP.md`의 Task 008-1 체크리스트 항목들을 모두 `[x]`로 변경.

- [ ] **Step 8: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "ROADMAP Task 008-1 완료 처리 — 이벤트 커버 이미지 업로드 및 수정 기능"
```

---

## Self-Review 결과

- **스펙 커버리지**: 데이터 모델(Task 1), Storage(Task 1), 레이어드 아키텍처 확장(Task 3-5), UI(Task 7-9), 타입/DTO(Task 2), 에러 처리(Task 2·4의 검증 재사용, Task 5의 owner 체크), 테스트 계획(Task 10) — 스펙의 모든 섹션에 대응하는 태스크가 있음.
- **플레이스홀더 스캔**: 없음. 모든 스텝에 완전한 코드가 포함됨.
- **타입 일관성 확인**: `uploadCoverImage`/`updateEvent`(repository) ↔ `uploadCoverImageRepository`/`updateEventRepository`(service의 import alias) ↔ `createEvent`/`updateEvent`(service) ↔ `createEventService`/`updateEventService`(controller의 import alias) 이름이 태스크 전체에서 일치함. `EventFormDefaultValues`/`EventFormProps`도 Task 7과 Task 8(사용부)에서 일치함.
