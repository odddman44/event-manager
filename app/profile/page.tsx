import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

// 가입일 포맷: 2026년 7월 28일 (서버 실행 위치와 무관하게 KST 고정)
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function ProfileContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", userId)
    .single();

  // 인증은 이미 확인된 상태라 로그인 페이지로 보내면 proxy가 다시 대시보드로 되돌려
  // 원인을 알 수 없는 튕김이 된다. 프로필 row가 없는 건 가입 트리거가 실패한 경우뿐이므로
  // 무슨 일이 일어났는지 화면에 알린다.
  if (!profile) {
    return (
      <div className="rounded-card bg-card space-y-3 border p-6 text-center shadow-sm">
        <p className="font-medium">😕 프로필 정보를 불러오지 못했습니다.</p>
        <p className="text-muted-foreground text-sm">
          계정은 정상이지만 프로필 정보가 만들어지지 않았습니다. 잠시 후 다시
          시도해도 같은 화면이 보이면 관리자에게 문의해주세요.
        </p>
        <LogoutButton />
      </div>
    );
  }

  return (
    <div className="rounded-card bg-card space-y-4 border p-6 shadow-sm">
      <div>
        <p className="text-muted-foreground text-xs">이름</p>
        <p className="font-medium">{profile.full_name ?? "이름 없음"}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">이메일</p>
        <p className="font-medium">{profile.email}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">가입일</p>
        <p className="font-medium">{formatDate(profile.created_at)}</p>
      </div>
      {profile.role === "admin" && (
        <div>
          <p className="text-muted-foreground text-xs">역할</p>
          <p className="font-medium">관리자</p>
        </div>
      )}
      <div className="border-t pt-4">
        <LogoutButton />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">프로필</h1>
      <Suspense>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
