"use client";

import { useActionState } from "react";
import { completeSetup } from "@/app/actions/auth";

export function SetupForm() {
  const [error, action, pending] = useActionState(completeSetup, null);

  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block">
        <span className="field-label">Your name</span>
        <input name="name" autoFocus className="field" placeholder="Darren Holm" />
      </label>
      <label className="block">
        <span className="field-label">Email</span>
        <input type="email" name="email" autoComplete="username" required className="field" />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          className="field"
        />
        <span className="mt-1 block text-xs text-muted">
          At least 12 characters. This protects several campaigns&apos; voter data —
          use something you do not use anywhere else.
        </span>
      </label>
      {error ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create administrator account"}
      </button>
    </form>
  );
}
