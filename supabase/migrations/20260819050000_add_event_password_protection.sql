-- 이벤트 암호 보호(#7): 해시는 별도 테이블에 저장해 events의 공개 SELECT 정책(using (true))에
-- 절대 노출되지 않게 한다. event_passwords는 RLS만 켜고 정책을 하나도 만들지 않아
-- admin client(service role)로만 접근 가능하다 — participants 잠금과 동일한 패턴.
create table public.event_passwords (
  event_id uuid primary key references public.events(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.event_passwords enable row level security;

-- events에는 참/거짓 플래그만 추가한다. 공개 조회돼도 무해하다 — 참여 페이지가
-- 암호 게이트를 보여줄지 판단하는 데만 쓴다.
alter table public.events add column has_password boolean not null default false;
