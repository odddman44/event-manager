create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  event_date timestamptz not null,
  location text,
  max_participants integer,
  share_token text not null unique default encode(gen_random_bytes(12), 'base64url'),
  created_at timestamptz not null default now()
);

comment on table public.events is '주최자가 생성한 이벤트';

alter table public.events enable row level security;

-- 주최자 본인 CRUD
create policy "주최자 본인 이벤트 CRUD"
  on public.events for all
  to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

-- share_token으로 공개 SELECT (비인증 포함)
create policy "share_token으로 이벤트 공개 조회"
  on public.events for select
  to anon, authenticated
  using (true);
