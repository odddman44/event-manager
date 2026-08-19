import { cache, Suspense } from "react";
import { type Metadata } from "next";
import JoinForm from "@/components/join-form";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getJoinPageData } from "@/src/services/participant-service";
import { getFullName } from "@/src/services/profile-service";

// generateMetadata와 페이지 컴포넌트가 같은 이벤트 데이터를 필요로 하는데, 요청 하나당
// 실제 조회는 한 번만 나가도록 React cache()로 묶는다.
const getCachedJoinPageData = cache(
  async (shareToken: string, userId: string | null) => {
    const supabase = await createClient();
    return getJoinPageData(supabase, shareToken, userId);
  },
);

// 카카오톡 등 메신저에 링크를 붙여넣었을 때 이벤트 사진/제목이 미리보기로 보이도록
// og:title, og:description, og:image를 이벤트별로 채운다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ share_token: string }>;
}): Promise<Metadata> {
  const { share_token } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const data = await getCachedJoinPageData(share_token, userId);

  if (!data) {
    return {};
  }

  const { event } = data;
  const eventDate = new Date(event.event_date).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const description = `${eventDate} · ${event.location ?? "장소 미정"}`;

  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      ...(event.cover_image_url && { images: [event.cover_image_url] }),
    },
  };
}

async function JoinPageContent({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const [data, loggedInName] = await Promise.all([
    getCachedJoinPageData(share_token, userId),
    userId ? getFullName(supabase, userId) : Promise.resolve(""),
  ]);

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-800">
          😕 유효하지 않은 참여 링크입니다.
        </p>
        <p className="mt-2 text-sm text-gray-500">링크를 다시 확인해주세요.</p>
      </main>
    );
  }

  return (
    <>
      {/* 비로그인 방문자에게는 지금처럼 미니멀한 화면을 유지하고, 로그인 상태일
          때만 다른 페이지와 동일한 앱 헤더를 보여준다. */}
      {userId !== null && <AppHeader />}
      {/* key로 로그인 상태(userId)를 넘겨 로그인 전/후 소프트 내비게이션 시 컴포넌트를
          강제로 리마운트한다 — JoinForm의 초기 state는 useState 지연 초기화라 마운트 시점
          props로만 계산되고, 리마운트 없이 props만 갱신되면 로그인 전 상태("choice")가
          그대로 남는다. */}
      <JoinForm
        key={userId ?? "anonymous"}
        shareToken={share_token}
        event={data.event}
        registeredCount={data.registeredCount}
        isFull={data.isFull}
        existingParticipant={data.existingParticipant}
        isLoggedIn={userId !== null}
        loggedInName={loggedInName}
        isOrganizer={data.isOrganizer}
      />
    </>
  );
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  return (
    <Suspense>
      <JoinPageContent params={params} />
    </Suspense>
  );
}
