alter table public.profiles add column onboarding_completed_at timestamptz;

-- 배포 시점에 이미 존재하는 유저에게 온보딩이 갑자기 뜨지 않도록 전원 완료 처리한다.
-- 신규 가입자는 이 UPDATE 이후에 만들어지므로 컬럼 기본값(null)을 그대로 받는다.
update public.profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
