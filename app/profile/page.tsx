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

  if (!profile) {
    redirect("/auth/login");
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
