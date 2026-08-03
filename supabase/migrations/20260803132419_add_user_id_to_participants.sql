-- 로그인 상태로 참여한 경우 계정과 연결한다. 비회원 참여는 null로 남아 기존 guest_token 흐름을 그대로 유지한다.
alter table public.participants
  add column user_id uuid references auth.users(id) on delete set null;

comment on column public.participants.user_id is '로그인 상태로 참여한 사용자의 ID. 비회원 참여는 null (guest_token으로만 식별)';

-- "내가 참여한 이벤트" 조회용 FK 인덱스
create index if not exists participants_user_id_idx on public.participants(user_id);
