-- handle_new_user()이 raw_user_meta_data의 full_name/avatar_url을 전혀 읽지 않아
-- 이메일 가입자(회원가입 폼에서 보낸 full_name)와 Google OAuth 가입자(name/avatar_url) 모두
-- profiles에 이름/아바타가 저장되지 않던 버그 수정
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 기존 가입자 백필: 이미 auth.users에 저장돼 있던 메타데이터로 채움 (기존에 값이 있으면 덮어쓰지 않음)
update public.profiles p
set
  full_name = coalesce(p.full_name, u.raw_user_meta_data->>'full_name'),
  avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url')
from auth.users u
where p.id = u.id;
