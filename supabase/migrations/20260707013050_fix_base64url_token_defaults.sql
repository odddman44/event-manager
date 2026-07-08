-- encode()는 'base64url' 인코딩을 지원하지 않아 INSERT 시 오류가 발생하던 문제 수정
-- base64 인코딩 후 URL-safe 문자로 치환하고 패딩을 제거
alter table public.events
  alter column share_token
  set default rtrim(translate(encode(gen_random_bytes(12), 'base64'), '+/', '-_'), '=');

alter table public.participants
  alter column guest_token
  set default rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
