"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, PlusCircle, User } from "lucide-react";

// 하단 네비게이션 아이템 정의
const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/dashboard", label: "이벤트", icon: Calendar },
  { href: "/events/new", label: "새 이벤트", icon: PlusCircle },
  { href: "/profile", label: "프로필", icon: User },
];

// 모바일 하단 고정 네비게이션 (md 이상에서는 숨김)
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 flex h-16 items-center justify-around border-t border-gray-100 bg-white md:hidden">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 text-xs ${
              active ? "text-primary" : "text-gray-500"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
