alter table public.events
  add column if not exists members_only boolean not null default false;
