import { LoginForm } from "@/components/login-form";
import { Suspense } from "react";

async function LoginFormContent({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return <LoginForm redirectTo={redirect} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <LoginFormContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
