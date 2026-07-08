-- profiles 테이블은 본인 프로필만 SELECT 가능한 정책만 있어 admin이 전체 사용자를 조회할 수 없었음
-- SECURITY DEFINER 함수로 무한 재귀 없이 admin 여부를 확인하고, admin에게는 전체 SELECT 권한 부여
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());
