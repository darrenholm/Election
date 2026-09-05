"use client";

import { useActionState, useState } from "react";
import { deleteCampaign, type CampaignSaveResult } from "@/app/actions/campaigns";

/**
 * Delete a campaign for good.
 *
 * Folded away until asked for, and then it says plainly what goes with it and
 * makes you type the candidate's name. Archiving is the reversible step and it
 * is one click; this one is not, so it is deliberately more work.
 */
export function DeleteCampaign({
  campaignId,
  candidateName,
  counts,
}: {
  campaignId: string;
  candidateName: string;
  counts: { contacts: number; volunteers: number; signRequests: number };
}) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<CampaignSaveResult, FormData>(
    deleteCampaign.bind(null, campaignId),
    null,
  );

  if (!open) {
    return (
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
          Delete permanently
        </button>
      </div>
    );
  }

  const attached = [
    counts.contacts > 0
      ? `${counts.contacts.toLocaleString("en-CA")} canvassing ${counts.contacts === 1 ? "contact" : "contacts"}`
      : null,
    counts.volunteers > 0
      ? `${counts.volunteers} ${counts.volunteers === 1 ? "volunteer" : "volunteers"}`
      : null,
    counts.signRequests > 0
      ? `${counts.signRequests} sign ${counts.signRequests === 1 ? "request" : "requests"}`
      : null,
  ].filter(Boolean);

  return (
    <form action={action} className="mt-2 rounded-lg border border-accent/40 bg-accent-soft p-3">
      <p className="text-sm font-medium text-accent-ink">
        Delete {candidateName}&apos;s campaign for good?
      </p>
      <p className="mt-1 text-xs text-accent-ink">
        This takes the whole campaign with it
        {attached.length > 0 ? ` — ${attached.join(", ")}` : ""}, along with its
        donors, contributions, expenses, turf, shifts, events and text
        campaigns. There is no undo.
      </p>
      <p className="mt-1 text-xs text-muted">
        The town&apos;s doors and electors stay: they belong to the municipality
        and other candidates are working from them.
      </p>

      <input
        name="confirmName"
        className="field mt-2 text-sm"
        placeholder={`Type ${candidateName} to confirm`}
        aria-label={`Type ${candidateName} to confirm`}
        autoComplete="off"
        required
      />

      {result?.error ? (
        <p className="mt-2 text-xs font-medium text-accent-ink">{result.error}</p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-xs">
          {pending ? "Deleting…" : "Delete for good"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
