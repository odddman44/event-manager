-- handle_new_user는 auth.users 트리거 전용이어야 하므로 PostgREST RPC로 직접 호출되지 않도록 EXECUTE 권한 회수
revoke execute on function public.handle_new_user() from anon, authenticated;

-- RLS 정책에서 auth.uid()가 행마다 재평가되지 않도록 (select auth.uid())로 변경
drop policy "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
