"use client";

import { useState, useTransition } from "react";
import { probeSanmar, syncSanmar, type ProbeResult } from "@/app/actions/suppliers";
import type { SyncReport } from "@/lib/shop/sanmar-sync";
import { formatCents } from "@/lib/money";
import { Note } from "@/components/ui";

/**
 * Two buttons: does SanMar answer, and load what they say.
 *
 * Deliberately not one button. Loading prices writes to the database and takes
 * a while; checking the connection writes nothing and comes back in seconds. On
 * a morning when the apparel is not working, the shop wants the second question
 * answered before the first one is asked.
 */
export function SuppliersPanel({ styles }: { styles: string[] }) {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [sync, setSync] = useState<SyncReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: "probe" | "sync") {
    setFailure(null);
    if (action === "probe") setProbe(null);
    else setSync(null);

    startTransition(async () => {
      try {
        if (action === "probe") setProbe(await probeSanmar());
        else setSync(await syncSanmar());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("probe")}
          disabled={pending}
          className="btn-secondary"
        >
          {pending ? "Working…" : "Check the connection"}
        </button>
        <button
          type="button"
          onClick={() => run("sync")}
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Working…" : "Load prices"}
        </button>
      </div>

      <p className="text-xs text-muted">
        Checking writes nothing and takes a few seconds. Loading prices reads{" "}
        {styles.length} styles and can take a minute — leave the page open.
      </p>

      {failure ? <Note tone="bad">{failure}</Note> : null}

      {probe ? (
        <div className="space-y-2">
          <Note tone={probe.ok ? "info" : "bad"}>
            {probe.ok
              ? `SanMar answered. The apparel prices can be loaded.`
              : `SanMar did not answer with anything usable.`}
          </Note>
          <ul className="space-y-1 text-xs leading-relaxed text-muted">
            {probe.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">What it asked</summary>
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="inline font-semibold">Environment: </dt>
                <dd className="inline">{probe.environment}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Style: </dt>
                <dd className="inline">{probe.style}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Warehouse: </dt>
                <dd className="inline">FOB {probe.fobId}</dd>
              </div>
              <div className="break-all">
                <dt className="inline font-semibold">Product data: </dt>
                <dd className="inline">{probe.productUrl}</dd>
              </div>
              <div className="break-all">
                <dt className="inline font-semibold">Pricing: </dt>
                <dd className="inline">{probe.pricingUrl}</dd>
              </div>
            </dl>
          </details>
        </div>
      ) : null}

      {sync ? (
        <div className="space-y-2">
          {!sync.configured ? (
            <Note tone="bad">
              SANMAR_USERNAME and SANMAR_PASSWORD are not set on this service. They are set
              on holmgraphics-shop-api in Railway — copy them across.
            </Note>
          ) : (
            <Note tone={sync.anyPriced ? "info" : "bad"}>
              {sync.anyPriced
                ? "Loaded. The apparel now prices itself from SanMar's costs."
                : "Nothing came back priced. Check the connection above."}
            </Note>
          )}
          <ul className="space-y-2 text-xs leading-relaxed">
            {sync.results.map((result) => (
              <li key={result.styleCode}>
                <span className="font-semibold">{result.styleCode}</span>{" "}
                {result.skus > 0 ? (
                  <span className="text-muted">
                    {result.skus} sizes across {result.colours} colours, from{" "}
                    {formatCents(result.fromRetailCents ?? 0)} each
                    {result.imported ? "" : " (not saved)"}
                  </span>
                ) : (
                  <span className="text-accent-ink">nothing came back</span>
                )}
                {result.problems.length > 0 ? (
                  <ul className="mt-0.5 pl-4 text-muted">
                    {result.problems.map((problem, i) => (
                      <li key={i}>{problem}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
