-- 보안: participants UPDATE가 anon/authenticated에게 완전히 열려있어(USING true) guest_token을 몰라도
-- 누구나 임의의 참여자 row를 수정할 수 있었음. 이 정책을 제거해 REST API 직접 접근을 차단하고,
-- 메모 수정/참여 취소는 이제 서버 전용 service_role 클라이언트로만 수행하도록 애플리케이션 코드를 변경한다.
drop policy "guest_token 소유자 본인 UPDATE" on public.participants;

-- 성능: FK 컬럼에 인덱스 추가
create index if not exists events_organizer_id_idx on public.events(organizer_id);
create index if not exists participants_event_id_idx on public.participants(event_id);

-- 성능: auth.uid()가 행마다 재평가되지 않도록 (select auth.uid())로 변경
drop policy "주최자 본인 이벤트 CRUD" on public.events;
create policy "주최자 본인 이벤트 CRUD"
  on public.events for all
  to authenticated
  using ((select auth.uid()) = organizer_id)
  with check ((select auth.uid()) = organizer_id);
