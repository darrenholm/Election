"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/app/actions/auth";

export function PasswordForm() {
  const [error, action, pending] = useActionState(changeOwnPassword, null);

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="field-label">Current password</span>
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          className="field"
        />
      </label>
      <label className="block">
        <span className="field-label">New password</span>
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          className="field"
        />
        <span className="mt-1 block text-xs text-muted">At least 12 characters.</span>
      </label>
      <label className="block">
        <span className="field-label">Confirm new password</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          className="field"
        />
      </label>
      {error ? (
        <p className="text-sm font-medium text-accent-ink">{error}</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
