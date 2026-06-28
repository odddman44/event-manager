"use client";

import { Button } from "@/components/ui/button";

export function AdminLogoutButton() {
  const handleLogout = () => {
    alert("로그아웃 기능은 준비 중입니다.");
  };

  return (
    <Button variant="outline" onClick={handleLogout}>
      로그아웃
    </Button>
  );
}
