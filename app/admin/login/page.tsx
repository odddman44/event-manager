"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { GoogleLoginButton } from "@/components/google-login-button";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profile?.role !== "admin") {
        await supabase.auth.signOut();
        setError("관리자 권한이 없습니다");
        return;
      }

      router.push("/admin");
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "로그인 오류가 발생했습니다",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="flex justify-end p-4">
        <ThemeSwitcher />
      </header>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          {/* 브랜드 */}
          <div className="text-center">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase">
              Moija Admin
            </p>
            <h1 className="mt-2 text-2xl font-bold">관리자 로그인</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              관리자 계정으로 로그인하여 대시보드에 접근하세요
            </p>
          </div>

          {/* Google 로그인 — 로그인 후 /auth/callback이 role에 따라 /admin 또는 /dashboard로 분기 */}
          <GoogleLoginButton />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="border-border w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">
                또는
              </span>
            </div>
          </div>

          {/* 이메일/비밀번호 폼 */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@moija.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs">
            일반 사용자 로그인은{" "}
            <a href="/auth/login" className="text-primary hover:underline">
              여기
            </a>
            에서 하세요
          </p>
        </div>
      </div>
    </div>
  );
}
