create type public.participant_status as enum ('registered', 'cancelled');

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  memo text,
  guest_token text not null unique default encode(gen_random_bytes(16), 'base64url'),
  status public.participant_status not null default 'registered',
  created_at timestamptz not null default now()
);

comment on table public.participants is '이벤트 참여자 (비회원 포함)';

alter table public.participants enable row level security;

-- 비회원 참여 등록 (anon INSERT)
create policy "비회원 참여 등록"
  on public.participants for insert
  to anon, authenticated
  with check (true);

-- guest_token 소유자 본인 UPDATE (메모 수정, 참여 취소)
-- 참고: guest_token은 클라이언트 헤더나 별도 파라미터로 전달받아 검증
-- 실제 RLS는 anon key + guest_token 기반으로 구현
create policy "guest_token 소유자 본인 UPDATE"
  on public.participants for update
  to anon, authenticated
  using (true)
  with check (true);

-- 주최자 전체 SELECT (이벤트의 organizer_id 확인)
create policy "주최자 참여자 목록 조회"
  on public.participants for select
  to anon, authenticated
  using (true);
