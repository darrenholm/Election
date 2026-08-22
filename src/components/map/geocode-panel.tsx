"use client";

import { useState } from "react";
import { runHouseholdGeocode, runSignGeocode, retryFailedGeocodes } from "@/app/actions/geocode";
import type { GeocodeRunResult } from "@/lib/geocode";

/**
 * Drives the geocoder in batches from the browser.
 *
 * A few thousand rural addresses is a long job, so it runs one batch at a time
 * with a visible count and a stop button, and every batch is committed before
 * the next begins. Closing the tab loses nothing but the current batch.
 */
export function GeocodePanel({
  configured,
  pendingHouseholds,
  pendingSigns,
  failed,
}: {
  configured: boolean;
  pendingHouseholds: number;
  pendingSigns: number;
  failed: number;
}) {
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [located, setLocated] = useState(0);
  const [failedNow, setFailedNow] = useState(0);
  const [remaining, setRemaining] = useState(pendingHouseholds + pendingSigns);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setStopRequested(false);
    setDone(false);
    setLocated(0);
    setFailedNow(0);
    setErrors([]);

    let stop = false;
    const onStop = () => {
      stop = true;
    };
    window.addEventListener("geocode:stop", onStop);

    try {
      // Households first — they are what the map is mostly made of.
      let result: GeocodeRunResult;
      do {
        result = await runHouseholdGeocode(50);
        setLocated((n) => n + result.located);
        setFailedNow((n) => n + result.failed);
        setRemaining(result.remaining);
        if (result.errors.length > 0) {
          setErrors((prev) => [...prev, ...result.errors].slice(0, 15));
        }
        window.dispatchEvent(new Event("campaign-map:refresh"));
      } while (result.remaining > 0 && result.attempted > 0 && !stop);

      if (!stop) {
        do {
          result = await runSignGeocode(50);
          setLocated((n) => n + result.located);
          setFailedNow((n) => n + result.failed);
          setRemaining(result.remaining);
          if (result.errors.length > 0) {
            setErrors((prev) => [...prev, ...result.errors].slice(0, 15));
          }
          window.dispatchEvent(new Event("campaign-map:refresh"));
        } while (result.remaining > 0 && result.attempted > 0 && !stop);
      }

      setDone(true);
    } finally {
      window.removeEventListener("geocode:stop", onStop);
      setRunning(false);
    }
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <strong>Geocoding is not configured.</strong> Set{" "}
        <code>GOOGLE_GEOCODING_API_KEY</code> in <code>.env</code> and restart to
        turn addresses into map pins. Until then the map can only show addresses
        you place by hand.
      </div>
    );
  }

  const total = pendingHouseholds + pendingSigns;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Waiting" value={remaining} />
        <Stat label="Located" value={located} tone="good" />
        <Stat label="Failed" value={failedNow + failed} tone={failedNow + failed > 0 ? "bad" : "neutral"} />
      </dl>

      {running ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full bg-brand transition-[width]"
              style={{ width: `${total > 0 ? ((total - remaining) / total) * 100 : 0}%` }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={stopRequested}
            onClick={() => {
              setStopRequested(true);
              window.dispatchEvent(new Event("geocode:stop"));
            }}
          >
            {stopRequested ? "Stopping after this batch…" : "Stop"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn-primary w-full"
          disabled={total === 0}
          onClick={run}
        >
          {total === 0
            ? "Everything is placed"
            : `Geocode ${total.toLocaleString("en-CA")} addresses`}
        </button>
      )}

      {done ? (
        <p className="text-xs text-muted">
          Finished. {located.toLocaleString("en-CA")} placed
          {failedNow > 0 ? `, ${failedNow.toLocaleString("en-CA")} could not be found` : ""}.
        </p>
      ) : null}

      {failed > 0 && !running ? (
        <form action={retryFailedGeocodes}>
          <button type="submit" className="btn-secondary w-full">
            Put {failed.toLocaleString("en-CA")} failed addresses back in the queue
          </button>
        </form>
      ) : null}

      {errors.length > 0 ? (
        <details className="rounded-lg border border-line p-2 text-xs">
          <summary className="cursor-pointer font-medium">
            {errors.length} address{errors.length === 1 ? "" : "es"} could not be placed
          </summary>
          <ul className="mt-2 space-y-1 text-muted">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-muted">
        Google charges per lookup after the monthly free credit. Each address is
        looked up once and the result stored, so a re-run only costs for
        addresses added since.
      </p>
    </div>
  );
}

function Stat({
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
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className={`text-lg font-bold tabular-nums ${colour}`}>
        {value.toLocaleString("en-CA")}
      </dd>
    </div>
  );
}
