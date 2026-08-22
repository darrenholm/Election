"use client";

import { useActionState } from "react";
import { createTeamMember, type CreatedUser } from "@/app/actions/team";
import { ROLE_OPTIONS } from "@/lib/roles";

/**
 * Creating an account. The temporary password is shown once, here, because the
 * app sends no email — it is read out or messaged, and the account must change
 * it at first sign-in.
 */
export function NewMemberForm({
  campaigns,
}: {
  campaigns: { id: string; label: string }[];
}) {
  const [result, action, pending] = useActionState<CreatedUser | null, FormData>(
    createTeamMember,
    null,
  );

  const created = result && "password" in result ? result : null;
  const error = result && "error" in result ? result.error : null;

  return (
    <div className="space-y-4">
      {created ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Account created for {created.email}
          </p>
          <p className="mt-2 text-xs text-emerald-900 dark:text-emerald-200">
            Temporary password — copy it now, it is not shown again:
          </p>
          <code className="mt-1 block rounded bg-surface px-2 py-1.5 text-sm font-bold tracking-wider">
            {created.password}
          </code>
          <p className="mt-2 text-xs text-emerald-900 dark:text-emerald-200">
            They will be asked to choose their own password when they sign in.
          </p>
        </div>
      ) : null}

      <form action={action} className="space-y-3">
        <label className="block">
          <span className="field-label">Name</span>
          <input name="name" className="field" placeholder="Rebecca Hergert" />
        </label>
        <label className="block">
          <span className="field-label">Email</span>
          <input type="email" name="email" required className="field" />
        </label>
        <label className="block">
          <span className="field-label">Give access to</span>
          <select name="campaignId" defaultValue="" className="field">
            <option value="">No campaign yet</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">As</span>
          <select name="role" defaultValue="OWNER" className="field">
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <input type="checkbox" name="isAdmin" className="mt-0.5 size-4 accent-[var(--color-brand)]" />
          <span>
            <span className="font-medium">Administrator</span>
            <span className="mt-0.5 block text-xs text-muted">
              Sees and manages every campaign. Only for you — never for a
              candidate.
            </span>
          </span>
        </label>

        {error ? (
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
