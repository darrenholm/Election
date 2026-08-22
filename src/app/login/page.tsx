import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // With no password configured there is nothing to sign in to.
  if (!authEnabled()) redirect("/");
  const { next } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight">Campaign Manager</h1>
      <p className="mt-1 text-sm text-muted">
        Enter the shared campaign password to continue.
      </p>
      <LoginForm next={next ?? "/"} />
      <p className="mt-6 text-xs text-muted">
        This system holds personal information about electors. Do not share the
        password outside the campaign team.
      </p>
    </div>
  );
}
