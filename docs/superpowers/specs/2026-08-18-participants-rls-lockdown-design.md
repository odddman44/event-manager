# `participants` 테이블 RLS 잠금 + admin client 전환 — 설계 문서

**배경:** `docs/superpowers/backlog-notes.md`의 `#11`. `participants` 테이블의 INSERT(`"비회원 참여 등록"`)와 SELECT(`"주최자 참여자 목록 조회"`) RLS 정책이 이름과 달리 `anon`/`authenticated` 누구에게나 완전히 열려있어(`with check (true)`, `using (true)`), 브라우저에 노출된 publishable key로 Supabase REST에 직접 요청하면 애플리케이션의 모든 서버 방어(정원 체크, `members_only` 체크 등)를 우회해 참여자를 생성하거나, 다른 참여자의 이름·메모·`guest_token`(취소/수정용 비밀 토큰)까지 그대로 읽어갈 수 있다.

## 접근법

`participants` 테이블에 대한 `anon`/`authenticated`용 INSERT/SELECT RLS 정책을 전부 제거해서, publishable key로는 이 테이블에 전혀 직접 접근할 수 없게 막는다. 대신 리포지토리 레이어의 모든 접근을 `createAdminClient()`(service role 키, RLS 우회)로 통일한다. 인가(누가 뭘 볼 수 있는지)는 이미 각 서비스 레이어 함수가 하고 있으므로 그대로 재사용한다 — 새 인가 로직을 추가하는 게 아니라, DB 접근 방식만 "RLS에 의존"에서 "서버 코드가 유일한 관문"으로 바꾸는 것이다.

이 프로젝트는 이미 이 방향으로 절반쯤 와 있다 — `updateParticipantMemo`, `cancelParticipation`, `reactivateParticipation`, `hardDeleteParticipant`(UPDATE/DELETE)와 `listRegisteredParticipantsForEvent`의 `profiles` 조회(SELECT)가 이미 admin client를 쓴다. 이번 작업은 나머지 INSERT/SELECT 지점을 마저 통일하는 것이다.

**대안으로 검토했으나 채택 안 함:** RLS 정책을 본인/주최자/관리자용으로 세분화하는 방식. 하지만 `countRegisteredParticipants` 같은 정원 카운트 함수는 비회원도 호출해야 하는데(신원 무관), RLS로는 "카운트만 허용, 내용 열람은 비허용"을 표현할 방법이 없어 결국 admin client로 빠질 수밖에 없다. 정책 여러 개 + admin client 예외가 섞이면 오히려 더 복잡해져서 기각.

## 코드 변경 대상 (18개 접근 지점 전수 조사 완료)

이미 admin client를 쓰고 있어 손댈 필요 없는 것: `participant-repository.ts`의 `updateParticipantMemo`, `cancelParticipation`, `reactivateParticipation`(내부 2회 조회 포함), `hardDeleteParticipant`, `listRegisteredParticipantsForEvent`의 `profiles` 조회.

**요청 스코프 클라이언트 → admin client로 바꿔야 하는 지점:**

`src/repositories/participant-repository.ts`:

- `createParticipant` (INSERT) — `joinEvent` 서비스가 이미 `members_only`/정원 체크를 마친 뒤 호출.
- `countRegisteredParticipants` — 비회원도 정원 체크로 호출(신원 무관하게 항상 동작해야 함).
- `getParticipantByGuestToken` — 익명 게스트도 자기 토큰으로 조회(신원이 아니라 "토큰을 아는가"가 인가 기준).
- `getParticipantByEventAndUser` — 호출부가 항상 자기 세션의 `userId`만 넘김.
- `countRegisteredBefore` — 정원 경쟁 순번 계산, 비회원도 호출.
- `listRegisteredParticipantsForEvent`의 `participants` 조회(아바타용 `profiles` 조회는 이미 전환됨) — `getEventParticipantRoster` 서비스가 이미 본인 확인 후 호출.

`src/repositories/event-repository.ts`:

- `listEventsByOrganizer`의 참여자 수 집계 — 이미 자기 이벤트 id로만 필터링된 뒤의 집계.
- `listParticipantsByEvent` — `getEventDetail` 서비스가 `event.organizer_id !== organizerId` 체크 후 호출(코드 확인 완료).
- `listEventsByParticipantUserId` — `app/dashboard/page.tsx`가 자기 세션 `userId`만 넘김, `/dashboard`는 미들웨어가 비로그인을 이미 차단.

`src/repositories/admin-repository.ts`:

- `countParticipants`, `listEventsWithOrganizer`의 참여자 수 집계, `getTopEventsByParticipants` — 전부 `admin-controller.ts`의 `requireAdmin`이 상위에서 이미 게이트(코드 확인 완료).

**작업 방식:** 이 세 파일에서 `.from("participants")`를 전수 검색해, 이미 `adminClient`/admin client를 쓰는 함수가 아닌 모든 곳을 위 목록대로 `createAdminClient()`로 바꾼다. 새로 export되는 함수 시그니처는 없다 — 함수 내부 구현만 바뀐다(파라미터/리턴 타입 불변이므로 이 리포지토리 함수들을 호출하는 서비스/컨트롤러 코드는 전혀 수정할 필요가 없다).

## 마이그레이션

```sql
drop policy "비회원 참여 등록" on public.participants;
drop policy "주최자 참여자 목록 조회" on public.participants;
```

## 검증

1. **기존 e2e 스위트(43개)** 가 이 경로 대부분을 이미 실질적으로 커버한다 — 비회원/회원 참여, 취소, 재참여, 정원 마감, 참여자 명단, 대시보드, 어드민 대시보드/이벤트/사용자 관리 전부 이 함수들을 거친다. 정책 제거 후에도 43/43 통과해야 한다(회귀 없음 = 인가가 실제로 안 뚫렸다는 증거).
2. **신규 보안 회귀 테스트 1건**: 비로그인 상태에서 Supabase REST에 `POST /rest/v1/participants`(임의 `event_id`로 INSERT 시도)와 `GET /rest/v1/participants?event_id=eq.<id>`(SELECT 시도)를 publishable key로 직접 보내서, 둘 다 빈 결과 또는 거부로 응답하는지 확인한다(정책 제거 전에는 이 요청들이 성공했어야 하는 것과 대비).

## 이번 스코프에서 다루지 않는 것

- `events` 테이블의 `"share_token으로 이벤트 공개 조회"` SELECT 정책(`using (true)`) — 의도된 공개 정책(참여 링크는 원래 누구나 볼 수 있어야 함)이라 손대지 않는다.
- `#7`(암호 보호), `#4`(날짜 범위), `#8`(로그인 시 헤더 노출) — 백로그 노트 참고, 별도 브레인스토밍.
