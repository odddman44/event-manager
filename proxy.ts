import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

const GUEST_ONLY_PATHS = ["/auth/login", "/auth/sign-up", "/admin/login"];
const USER_PROTECTED_PREFIXES = ["/dashboard", "/events"];

async function getRole(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role ?? null;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims는 createServerClient 직후에 바로 호출해야 함
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const { pathname } = request.nextUrl;

  const isAdminPath =
    pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isUserProtected = USER_PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  const isGuestOnly = GUEST_ONLY_PATHS.includes(pathname);

  function redirect(path: string): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach(({ name, value, ...opts }) =>
        res.cookies.set(name, value, opts),
      );
    return res;
  }

  // 비로그인 전용 페이지 + 로그인 상태 → role에 따라 분기
  if (isGuestOnly && userId) {
    const role = await getRole(supabase, userId);
    return redirect(role === "admin" ? "/admin" : "/dashboard");
  }

  // 유저 전용 경로 + 비로그인 → /auth/login
  if (isUserProtected && !userId) {
    return redirect("/auth/login");
  }

  // 어드민 경로 + 비로그인 → /admin/login
  if (isAdminPath && !userId) {
    return redirect("/admin/login");
  }

  // 어드민 경로 + 로그인 + role 확인
  if (isAdminPath && userId) {
    const role = await getRole(supabase, userId);
    if (role !== "admin") {
      return redirect("/dashboard");
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
