-- 여러 날 모임 지원(#4). nullable — null이면 기존과 동일한 단일 날짜 이벤트.
alter table public.events add column end_date timestamptz null;
