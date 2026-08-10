-- 커버 이미지 교체/이벤트 삭제 시 고아 파일 정리를 위해 DELETE 정책 추가
-- (본인 폴더 하위 파일만 삭제 가능, INSERT 정책과 동일한 소유권 검증 패턴)
create policy "이벤트 커버 이미지 삭제 - 본인 폴더만"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
