# 이벤트 커버 이미지 업로드 + 이벤트 수정 기능 설계

## 배경

ROADMAP Task 008-1(이벤트 커버 이미지 업로드)을 진행하면서, "생성/수정 폼에 이미지 업로드 UI 추가"라는 항목이 있었으나 이벤트 "수정" 기능 자체가 아직 없다는 걸 확인했다. 이번 작업 범위를 이벤트 수정 기능 신설까지 포함하는 것으로 넓혔다.

## 범위

- 이벤트 생성/수정 폼에 커버 이미지 업로드
- 이벤트 수정 페이지 신설 (제목/날짜/장소/정원/설명/커버이미지 전체 수정 가능)
- 커버 이미지를 주최자·참여자가 보는 화면(대시보드, 이벤트 관리 페이지, 참여 페이지)에 노출, 없으면 기본 이미지로 대체
- 어드민 화면은 이번 스코프에서 제외 (실데이터 연결 시 이미지 없이 재구성했고, 이번에도 텍스트 위주 유지)

## 데이터 모델

`events` 테이블에 컬럼 추가:

```sql
alter table public.events add column cover_image_url text;
```

- nullable, 기본값 없음. `null`이면 UI에서 기본 이미지로 대체 표시.
- DB에는 이미지 바이너리가 아니라 **Supabase Storage의 공개 URL 문자열만** 저장한다.

## Storage

- 신규 **public 버킷** `event-covers` 생성 (참여자도 봐야 하므로 공개 버킷으로 함 — 참여 페이지는 비로그인 상태로도 접근하기 때문에 signed URL 방식은 맞지 않음)
- 저장 경로: `{organizer_id}/{random-uuid}.{ext}`
- RLS(`storage.objects`, 버킷 `event-covers` 한정):
  - INSERT: `authenticated` 역할, 경로가 `auth.uid()`로 시작하는 경우만 허용
  - SELECT: 버킷이 public이라 별도 정책 없이 공개 URL로 누구나 읽기 가능
  - UPDATE/DELETE 정책은 만들지 않음 — 이미지 교체 시 새 파일을 업로드하고 URL만 갱신, 기존 파일 삭제는 하지 않음(미아 파일 정리는 이번 스코프 밖)

## 레이어드 아키텍처 확장

**src/lib/validations.ts**

- `validateCoverImage(file: File): string | null` 추가 — 5MB 초과 또는 JPG/PNG/WebP 외 형식이면 에러 메시지 반환, 정상이면 `null`. 클라이언트(즉시 피드백)와 서버(재검증) 양쪽에서 재사용.
- zod 스키마에 파일 필드를 넣지 않음 — `<input type="file">`은 `FileList`를 주는데 zodResolver와 궁합이 좋지 않아, 파일 검증은 이 별도 함수로 분리.

**src/repositories/event-repository.ts**

- `uploadCoverImage(supabase, organizerId, file): Promise<string>` — `event-covers` 버킷에 업로드 후 public URL 반환
- `updateEvent(supabase, eventId, dto): Promise<Event>` — 이벤트 row 업데이트
- `createEvent()`가 `cover_image_url`도 insert에 포함하도록 확장

**src/services/event-service.ts**

- `createEvent(supabase, organizerId, input, coverImageFile?)` — 파일이 있으면 `validateCoverImage` 재검증 → 업로드 → URL을 DTO에 실어 repository 호출
- 신규 `updateEvent(supabase, eventId, organizerId, input, coverImageFile?)` — 소유자 검증(기존 `getEventDetail`과 동일한 패턴) 후, 파일이 있으면 업로드해 새 URL로 교체하고 없으면 기존 `cover_image_url` 유지

**src/controllers/event-controller.ts**

- `createEventAction`이 `coverImage?: File`도 받도록 확장
- 신규 `updateEventAction(eventId, input, coverImage?)` — Server Action. 인증 확인 → 서비스 호출 → 성공 시 `/events/{id}`로 redirect, 실패 시 `{success:false, error}` 반환

## UI

- `components/event-form.tsx`를 생성/수정 공용으로 리팩터링
  - `mode: "create" | "edit"` prop 추가
  - edit 모드일 때 `eventId`, `defaultValues`, `existingCoverImageUrl`을 props로 받아 폼 초기값으로 채움
  - 파일 입력(`<input type="file" accept="image/jpeg,image/png,image/webp">`) 추가, 선택 시 `URL.createObjectURL`로 미리보기, `validateCoverImage`로 즉시 에러 표시
  - 제출 시 `mode`에 따라 `createEventAction` 또는 `updateEventAction` 호출
- 신규 페이지 `app/events/[id]/edit/page.tsx` — 기존 `getEventDetail`(주최자 본인 검증 이미 포함)을 재사용해 이벤트 조회 후 `<EventForm mode="edit" .../>` 렌더링
- `app/events/[id]/page.tsx`(관리 페이지)에 "수정" 버튼 추가, `/events/{id}/edit`로 연결
- 커버 이미지 노출 위치 3곳, 없으면 기본 이미지로 대체:
  - `app/dashboard/page.tsx` (이벤트 카드)
  - `app/events/[id]/page.tsx` (관리 페이지 상단)
  - `components/join-form.tsx` (참여 페이지 상단)
- 기본 이미지: `public/images/default-event-cover.svg` 신규 제작 (브랜드 컬러 `#FF6B35` 기반 심플한 플레이스홀더)

## 타입/DTO 변경

`src/types/index.ts`:

- `Event.cover_image_url: string | null` 추가
- `CreateEventDto`, `UpdateEventDto`에 `cover_image_url?: string` 추가

## 에러 처리

- 파일 형식/크기 오류: 클라이언트에서 즉시 표시 + 서버에서 재검증(우회 방지)
- Storage 업로드 실패: 이벤트 생성/수정 자체를 실패 처리 — 이미지 없이 부분 성공시키지 않음
- 수정 시 파일 미선택: 기존 `cover_image_url` 그대로 유지
- 타인 이벤트의 `/events/{id}/edit` 접근: 기존 `getEventDetail`의 소유자 검증 로직 재사용으로 자동 차단(`/dashboard`로 리다이렉트)

## 테스트 계획 (Playwright MCP)

- 이미지 없이 이벤트 생성 → 대시보드/관리/참여 페이지 3곳에 기본 이미지 노출 확인
- 이미지 업로드하며 이벤트 생성 → 3곳에 실제 이미지 반영 확인
- 이벤트 수정 페이지 진입 시 기존 값 프리필 확인 → 제목/이미지 변경 후 저장 → 반영 확인
- 5MB 초과 또는 잘못된 형식 업로드 시 클라이언트 에러 표시 확인
- 타 사용자가 `/events/{id}/edit` 접근 시 차단 확인
