"use client";

import { useActionState } from "react";
import { updateCampaign, type CampaignSaveResult } from "@/app/actions/campaigns";

/**
 * Wraps the settings form so a save that cannot go through — a municipality
 * name that collides with another town — says so instead of failing silently.
 */
export function SettingsForm({
  campaignId,
  children,
}: {
  campaignId: string;
  children: React.ReactNode;
}) {
  const save = updateCampaign.bind(null, campaignId);
  const [result, action, pending] = useActionState<CampaignSaveResult, FormData>(save, null);

  return (
    <form action={action} className="space-y-6">
      {children}

      {result?.error ? (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          {result.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
