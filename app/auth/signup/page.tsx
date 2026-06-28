import { redirect } from "next/navigation";

// /auth/sign-up 으로 정규화 (기존 라우트 유지)
export default function SignupPage() {
  redirect("/auth/sign-up");
}
