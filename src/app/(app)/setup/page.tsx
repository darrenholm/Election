import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

/** One-time creation of the administrator account. Unreachable once a user exists. */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight">Set up Campaign Manager</h1>
      <p className="mt-1 text-sm text-muted">
        Create the administrator account. This is you — the person running the
        campaigns — not a candidate. You can add candidates and give them access
        to their own campaign afterwards.
      </p>
      <SetupForm />
      <p className="mt-6 text-xs text-muted">
        This page works only while no accounts exist, so it cannot be used to add
        an administrator later.
      </p>
    </div>
  );
}
