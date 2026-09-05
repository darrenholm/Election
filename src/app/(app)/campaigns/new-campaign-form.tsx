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
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          {result.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
