import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Nobody exists yet: send the first visitor to create the administrator
  // rather than showing a form no password can satisfy.
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const { next } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight">Campaign Manager</h1>
      <p className="mt-1 text-sm text-muted">Sign in to your campaign.</p>
      <LoginForm next={next ?? "/"} />
      <p className="mt-6 text-xs text-muted">
        This system holds personal information about electors. Your account
        reaches only the campaigns you have been given.
      </p>
    </div>
  );
}
