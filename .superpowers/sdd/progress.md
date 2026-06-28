# SDD Progress Ledger — Event Manager MVP

Started: 2026-06-28
Branch: main
Base commit: d773406

## Decisions

- TailwindCSS: v3 → v4 업그레이드
- Starter cleanup: 먼저 실행 후 Task 001 진행
- Branch: main에서 직접 진행

## Tasks

| Task   | Description                                     | Status   | Commits                     |
| ------ | ----------------------------------------------- | -------- | --------------------------- |
| PRE    | 스타터 템플릿 정리 (starter-cleaner)            | complete | d773406..885073f            |
| 001    | Next.js 초기화 + TailwindCSS v4 + 레이어드 구조 | complete | 885073f..e7e4ba7            |
| 002    | Supabase 클라이언트 설정 검증                   | complete | (검증만, 변경 없음) e7e4ba7 |
| 003    | DB 스키마 (events, participants) + RLS          | complete | e7e4ba7..f3d3ef6            |
| 004    | 공통 타입 + 라우트 스캐폴딩                     | complete | -                           |
| UI-001 | 랜딩 + 인증 페이지 UI (더미 데이터)             | complete | 43d0cd1..b8744be            |
| UI-002 | 주최자 대시보드 UI (더미 데이터)                | complete | b8744be..a4e13a3            |
| UI-003 | 참여자 페이지 UI (더미 데이터)                  | complete | a4e13a3..5ffc53e            |
| UI-004 | 어드민 UI (더미 데이터)                         | complete | 5ffc53e..1f65f30            |
| 005    | 회원가입/로그인/로그아웃 (F010)                 | pending  | -                           |
| 006    | 접근 제어 미들웨어                              | pending  | -                           |
| 007    | 이벤트 생성 (F001)                              | pending  | -                           |
| 008    | 내 이벤트 목록 (F002)                           | pending  | -                           |
| 009    | 이벤트 관리 (F003)                              | pending  | -                           |
| 010    | 비회원 참여 신청 (F004)                         | pending  | -                           |
| 011    | 참여 상태 변경 (F005)                           | pending  | -                           |
| 011-1  | 주최자-참여자 통합 플로우 테스트                | pending  | -                           |
| 012    | 플랫폼 통계 조회 (F006)                         | pending  | -                           |
| 013    | 전체 이벤트 관리 (F007)                         | pending  | -                           |
| 014    | 전체 사용자 관리 (F008)                         | pending  | -                           |
| 015    | 전체 E2E 통합 테스트                            | pending  | -                           |
| 016    | Vercel 배포                                     | pending  | -                           |
