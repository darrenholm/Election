"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(signIn, null);

  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="field-label">Password</span>
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          required
          className="field"
        />
      </label>
      {error ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
