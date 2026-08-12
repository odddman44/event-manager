import { Suspense } from "react";
import JoinForm from "@/components/join-form";
import { createClient } from "@/lib/supabase/server";
import { getJoinPageData } from "@/src/services/participant-service";
import { getFullName } from "@/src/services/profile-service";

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
    getJoinPageData(supabase, share_token, userId),
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
    <JoinForm
      shareToken={share_token}
      event={data.event}
      registeredCount={data.registeredCount}
      isFull={data.isFull}
      existingParticipant={data.existingParticipant}
      isLoggedIn={userId !== null}
      loggedInName={loggedInName}
    />
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
