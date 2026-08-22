"use client";

import { useActionState } from "react";
import { createCampaign, type CampaignSaveResult } from "@/app/actions/campaigns";

/** Surfaces the validation messages from creating a campaign. */
export function NewCampaignForm({ children }: { children: React.ReactNode }) {
  const [result, action, pending] = useActionState<CampaignSaveResult, FormData>(
    createCampaign,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      {children}

      {result?.error ? (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {result.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
