-- events RLS는 "주최자 본인"만 CRUD 가능하도록 되어 있어 admin이 타 사용자 이벤트를 삭제할 수 없었음
-- profiles와 동일한 is_admin() 함수를 재사용해 admin 전체 CRUD 허용
create policy "Admins can manage all events"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
