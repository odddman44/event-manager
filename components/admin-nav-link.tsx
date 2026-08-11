import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// 어드민 계정이 사용자 화면에서 관리자 화면으로 돌아갈 진입점(어드민 사이드바의
// "사용자 화면으로"와 대칭). role 조회가 동적 데이터라 레이아웃 전체를 블로킹하지 않도록
// 별도 컴포넌트로 분리해 호출부에서 Suspense로 감싼다.
export async function AdminNavLink() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role !== "admin") {
    return null;
  }

  return (
    <Link href="/admin" className="text-muted-foreground hover:text-foreground">
      관리자 화면으로
    </Link>
  );
}
