-- Storage API의 remove()/list() 등은 내부적으로 SELECT 권한이 필요하다.
-- 버킷이 public이라 다운로드 자체는 정책 없이 가능하지만, 삭제 대상 조회를 위해
-- 본인 폴더에 한해 SELECT 정책을 추가한다 (INSERT/DELETE 정책과 동일한 소유권 검증 패턴).
create policy "이벤트 커버 이미지 조회 - 본인 폴더만"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
