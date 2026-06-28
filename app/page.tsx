import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 헤더 */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-brand text-xl font-bold">모이자</span>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Link href="/auth/login">
            <Button variant="outline" size="sm">
              로그인
            </Button>
          </Link>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1">
        {/* 히어로 섹션 */}
        <section className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            모이자
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm">
            링크 하나로 이벤트를 만들고, 사람들을 모아보세요
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/auth/sign-up">
              <Button className="bg-brand hover:bg-brand/90 text-white">
                시작하기
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline">로그인</Button>
            </Link>
          </div>
        </section>

        {/* 기능 소개 카드 섹션 */}
        <section className="px-6 pb-20">
          <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-3">
            <Card className="rounded-card">
              <CardHeader>
                <CardTitle className="text-base">간편한 이벤트 생성</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  제목/날짜/장소만 입력하면 공유 링크 자동 발급
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-card">
              <CardHeader>
                <CardTitle className="text-base">회원가입 없는 참여</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  링크 클릭 후 이름만 입력, 즉시 참여
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-card">
              <CardHeader>
                <CardTitle className="text-base">실시간 참여 현황</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  한 페이지에서 참여자 목록 확인
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* 푸터 */}
      <footer className="text-muted-foreground border-t py-6 text-center text-sm">
        © 2026 모이자
      </footer>
    </div>
  );
}
