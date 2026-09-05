import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Card, Note, PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Change your password"
        subtitle={user.email}
      />
      {user.mustChangePassword ? (
        <div className="mb-6">
          <Note tone="warn">
            You are signed in with a temporary password. Choose your own before
            carrying on.
          </Note>
        </div>
      ) : null}
      <Card>
        <PasswordForm />
      </Card>
    </div>
  );
}
