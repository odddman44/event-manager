-- 로그인 사용자의 참여는 이벤트당 최대 1건만 존재해야 한다. user_id가 null인 비회원 참여는
-- guest_token만으로 식별되므로 이 제약에서 제외한다(부분 인덱스).
-- 애플리케이션 레벨에서 이미 "먼저 조회 후 재사용"으로 막고 있지만, 동시 요청 레이스 컨디션까지
-- 막으려면 DB 제약이 필요하다.
create unique index if not exists participants_event_user_unique
  on public.participants(event_id, user_id)
  where user_id is not null;
