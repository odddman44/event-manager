alter table public.events add column cover_image_url text;

comment on column public.events.cover_image_url is '이벤트 커버 이미지의 Supabase Storage 공개 URL. null이면 기본 이미지로 대체 표시';
