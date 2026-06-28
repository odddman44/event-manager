-- PUBLIC 역할에 기본으로 부여된 EXECUTE 권한 회수 (anon/authenticated는 PUBLIC을 통해 상속받고 있었음)
revoke execute on function public.handle_new_user() from public;
