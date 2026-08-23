"use client";

import { useState } from "react";
import { publishDue, type PublishOutcome } from "@/app/actions/social";

/**
 * Post everything that is approved and due.
 *
 * There is no scheduler behind this app, so "due" means due the last time
 * somebody opened the page. That is the honest trade for not running a cron:
 * a campaign that never opens the app on a Tuesday posts on Wednesday.
 */
export function PublishRunner({ due }: { due: number }) {
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);
  const [running, setRunning] = useState(false);

  if (due === 0 && !outcome) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={running}
        onClick={async () => {
          setRunning(true);
          try {
            setOutcome(await publishDue(10));
          } finally {
            setRunning(false);
          }
        }}
        className="btn-primary"
      >
        {running ? "Posting…" : `Post the ${due} that ${due === 1 ? "is" : "are"} due`}
      </button>

      {outcome ? (
        <p className="text-xs text-muted">
          {outcome.published > 0
            ? `${outcome.published} ${outcome.published === 1 ? "post" : "posts"} ${
                outcome.dryRun ? "would have gone out — dry run, no Page connected" : "sent to Facebook"
              }.`
            : "Nothing went out."}
          {outcome.failed > 0 ? ` ${outcome.failed} failed.` : ""}
          {outcome.errors.length > 0 ? ` ${outcome.errors.join("; ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}
