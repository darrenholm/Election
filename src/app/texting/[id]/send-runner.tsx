"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendBatch } from "@/app/actions/texting";
import type { SendBatchResult } from "@/lib/sms";

/**
 * Works through a queued send in batches, with a stop button.
 *
 * Batched for the same reason geocoding is: a few hundred messages take longer
 * than any request should, and stopping partway has to be safe. Each message
 * row is marked as it goes, so pressing send again picks up exactly where it
 * left off and nobody is texted twice.
 */
export function SendRunner({
  campaignId,
  queued,
  configured,
}: {
  campaignId: string;
  queued: number;
  configured: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [sent, setSent] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const [remaining, setRemaining] = useState(queued);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  async function run() {
    setRunning(true);
    setStopping(false);
    setErrors([]);

    let stop = false;
    const onStop = () => {
      stop = true;
    };
    window.addEventListener("send:stop", onStop);

    try {
      let result: SendBatchResult;
      do {
        result = await sendBatch(campaignId, 25);
        setSent((n) => n + result.sent);
        setSkipped((n) => n + result.skipped);
        setFailed((n) => n + result.failed);
        setRemaining(result.remaining);
        if (result.errors.length > 0) {
          setErrors((prev) => [...prev, ...result.errors].slice(0, 15));
        }
      } while (result.remaining > 0 && result.attempted > 0 && !stop);
    } finally {
      window.removeEventListener("send:stop", onStop);
      setRunning(false);
      router.refresh();
    }
  }

  if (queued === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing left in the queue for this send.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Figure label="Sent" value={sent} tone="good" />
        <Figure label="Skipped" value={skipped} />
        <Figure label="Failed" value={failed} tone={failed > 0 ? "bad" : "neutral"} />
      </dl>

      {running ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full bg-brand transition-[width]"
              style={{ width: `${queued > 0 ? ((queued - remaining) / queued) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted">
            {remaining.toLocaleString("en-CA")} left to go.
          </p>
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              window.dispatchEvent(new Event("send:stop"));
            }}
          >
            {stopping ? "Stopping after this batch…" : "Stop"}
          </button>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
            />
            <span>
              I have read the message and want to send it to{" "}
              <strong>{remaining.toLocaleString("en-CA")}</strong> people.
              {!configured ? " (Dry run — nothing will actually go out.)" : ""}
            </span>
          </label>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!confirmed}
            onClick={run}
          >
            {configured
              ? `Send to ${remaining.toLocaleString("en-CA")} people`
              : `Dry-run ${remaining.toLocaleString("en-CA")} messages`}
          </button>
        </>
      )}

      {errors.length > 0 ? (
        <details className="rounded-lg border border-line p-2 text-xs">
          <summary className="cursor-pointer font-medium">{errors.length} failures</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
}) {
  const colour = {
    neutral: "text-ink",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${colour}`}>
        {value.toLocaleString("en-CA")}
      </dd>
    </div>
  );
}
