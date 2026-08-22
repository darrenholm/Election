"use client";

import { useActionState } from "react";
import { resetPassword, type CreatedUser } from "@/app/actions/team";

export function ResetButton({ userId }: { userId: string }) {
  const [result, action, pending] = useActionState<CreatedUser | null, FormData>(
    resetPassword,
    null,
  );
  const created = result && "password" in result ? result : null;

  return (
    <form action={action} className="inline">
      <input type="hidden" name="userId" value={userId} />
      {created ? (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-muted">New password:</span>
          <code className="rounded bg-raise px-1.5 py-0.5 font-bold tracking-wide">
            {created.password}
          </code>
        </span>
      ) : (
        <button type="submit" disabled={pending} className="btn-ghost text-xs">
          {pending ? "Resetting…" : "Reset password"}
        </button>
      )}
    </form>
  );
}
