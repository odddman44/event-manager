-- 이벤트 커버 이미지 전용 public 버킷 (참여 페이지는 비로그인 접근이라 signed URL 대신 공개 URL 사용)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- 업로드는 인증된 사용자가 자기 uid 폴더 아래에만 가능 (경로: {organizer_id}/{uuid}.{ext})
create policy "이벤트 커버 이미지 업로드 - 본인 폴더만"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT는 버킷이 public이라 별도 정책 없이 공개 URL로 조회 가능 (정책 생성 안 함)
-- UPDATE/DELETE 정책도 생성하지 않음 (교체 시 새 파일 업로드, 기존 파일 삭제는 스코프 밖)
