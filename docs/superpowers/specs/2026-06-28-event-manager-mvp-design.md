# 이벤트 관리 웹 MVP 설계 문서

**작성일:** 2026-06-28  
**프로젝트:** event-manager  
**스택:** Next.js (App Router) + Supabase + Tailwind CSS + shadcn/ui + TypeScript

---

## 1. 개요

### 문제

수영, 헬스, 친구 모임 등의 이벤트를 주최할 때 주최자는 참여자 파악, 공지, 정산, 카풀 등 여러 관리 업무를 카카오톡 등 메신저로 비효율적으로 처리한다.

### 목표

주최자가 이벤트를 만들고 링크를 공유하면, 참여자가 회원가입 없이 즉시 참여 의사를 밝힐 수 있는 MVP를 구축한다.

### MVP 범위

- ✅ 이벤트 생성 및 관리
- ✅ 링크 공유 기반 비회원 참여
- ✅ 참여자 관리 (참여확인 / 취소 / 한 줄 메모)
- ✅ 플랫폼 어드민 (통계 + 전체 이벤트/사용자 관리)
- ❌ 정산 (MVP 제외)
- ❌ 카풀 (MVP 제외)

---

## 2. 사용자 역할

| 역할       | 디바이스 | 인증                | 설명                                |
| ---------- | -------- | ------------------- | ----------------------------------- |
| **어드민** | 데스크톱 | 로그인 + admin 권한 | 플랫폼 전체 관리                    |
| **주최자** | 모바일   | 로그인 필요         | 이벤트 생성 및 참여자 관리          |
| **참여자** | 모바일   | 불필요 (게스트)     | 링크로 접근, 이름+메모 입력 후 참여 |

---

## 3. 데이터 모델

### 기존 테이블 수정

```sql
-- profiles 테이블에 role 컬럼 추가
ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));
```

### 신규 테이블

```sql
-- 이벤트
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  event_date      timestamptz NOT NULL,
  location        text,
  max_participants int,
  share_token     uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 참여자
CREATE TABLE participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  memo        text,
  guest_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'attending' CHECK (status IN ('attending', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### RLS 정책

| 테이블       | 규칙                                                            |
| ------------ | --------------------------------------------------------------- |
| events       | 주최자 본인만 CRUD, share_token으로 SELECT 공개                 |
| participants | guest_token 소유자가 본인 행 UPDATE, event 주최자가 전체 SELECT |

---

## 4. 페이지 구조

```
app/
  page.tsx                        ← 랜딩 (로그인 유도)

  # 어드민 영역 (데스크톱)
  admin/
    page.tsx                      ← 통계 대시보드
    events/
      page.tsx                    ← 전체 이벤트 목록 + 삭제
    users/
      page.tsx                    ← 전체 사용자 목록 + 삭제

  # 주최자 영역 (모바일)
  dashboard/
    page.tsx                      ← 내 이벤트 목록
  events/
    new/
      page.tsx                    ← 이벤트 생성 폼
    [id]/
      page.tsx                    ← 이벤트 관리 (참여자 목록 + 공유 링크)

  # 참여자 영역 (모바일, 공개)
  join/
    [shareToken]/
      page.tsx                    ← 참여 페이지
```

---

## 5. 사용자 흐름

### 주최자 흐름

```
로그인 → /dashboard (이벤트 목록)
→ [새 이벤트] → /events/new (제목, 날짜, 장소, 정원 입력)
→ /events/[id] (이벤트 관리)
  → 공유 링크 복사 → 카카오톡 전송
  → 참여자 목록 실시간 확인
```

### 참여자 흐름

```
링크 클릭 → /join/[shareToken]
→ 이름 + 메모(선택) 입력 → [참여하기]
→ guest_token을 localStorage에 저장
→ 재방문 시 자동 인식 → [메모 수정] / [참여 취소] 가능
```

### 어드민 흐름

```
로그인 (admin 계정) → /admin
→ 통계 카드: 총 가입자 / 총 이벤트 / 총 참여자
→ /admin/events: 전체 이벤트 테이블 (삭제 가능)
→ /admin/users: 전체 사용자 테이블 (삭제 가능)
```

---

## 6. UI/UX 방향

### 디자인 스타일: 럭키밀 영감

- **색상:** 따뜻한 오렌지/코럴 계열 포인트 컬러 (`#FF6B35` 계열)
- **모서리:** 넉넉한 border-radius (16px~24px)
- **여백:** 넉넉한 padding, 카드 간격
- **타이포그래피:** 굵고 깔끔한 한글, 계층 명확
- **레이아웃:** 카드 기반, 군더더기 없는 구성

### 반응형 전략

| 영역   | 레이아웃 패턴                              |
| ------ | ------------------------------------------ |
| 어드민 | 사이드바 + 테이블 (min-width: 1024px)      |
| 주최자 | 모바일 카드 리스트 (max-width: 430px 기준) |
| 참여자 | 싱글 페이지 폼 (스크롤 없이 한 화면)       |

---

## 7. 아키텍처

### 레이어 구조

```
Controller (Next.js Server Actions / Route Handlers)
  └── Service (비즈니스 로직)
        └── Repository (Supabase 쿼리)
```

### 주요 디렉토리

```
lib/
  supabase/
    client.ts       ← 브라우저 클라이언트
    server.ts       ← 서버 클라이언트
  services/
    event.service.ts
    participant.service.ts
    admin.service.ts
  repositories/
    event.repository.ts
    participant.repository.ts
    admin.repository.ts
  types/
    event.types.ts
    participant.types.ts

components/
  ui/               ← shadcn 기본 컴포넌트
  events/           ← 이벤트 관련 컴포넌트
  participants/     ← 참여자 관련 컴포넌트
  admin/            ← 어드민 관련 컴포넌트
```

---

## 8. 미들웨어 / 접근 제어

```
middleware.ts
  - /admin/*       → admin role 확인, 아니면 /dashboard로 리다이렉트
  - /dashboard/*   → 로그인 확인, 아니면 /auth/login으로 리다이렉트
  - /events/*      → 로그인 확인
  - /join/*        → 공개 (인증 불필요)
```

---

## 9. 검증 계획

| 시나리오       | 검증 방법                                                                |
| -------------- | ------------------------------------------------------------------------ |
| 이벤트 생성    | 주최자 로그인 → /events/new 폼 제출 → /dashboard에서 확인                |
| 링크 공유 참여 | /join/[token] 접속 → 이름 입력 → 참여 완료 → 주최자 화면에서 참여자 확인 |
| 참여 취소/수정 | 재방문 시 localStorage 토큰으로 자동 인식 → 취소 버튼 동작 확인          |
| 어드민 통계    | /admin 접속 → 가입자/이벤트/참여자 수 정확성 확인                        |
| 권한 제어      | 일반 사용자로 /admin 접속 시 리다이렉트 확인                             |
| 비회원 차단    | 로그인 없이 /dashboard 접속 시 /auth/login 리다이렉트 확인               |
