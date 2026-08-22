"use client";

import Papa from "papaparse";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  importAddresses,
  type AddressImportResult,
  type AddressRow,
} from "@/app/actions/voters";

/** The household fields a civic address file can populate. */
const TARGETS = [
  { key: "streetNumber", label: "Street number", hints: ["streetno", "streetnumber", "civicnumber", "housenumber", "number", "stno", "civic"] },
  { key: "streetName", label: "Street name", hints: ["street", "streetname", "strname", "road", "fulladdr"] },
  { key: "unit", label: "Unit / apt", hints: ["unit", "apt", "apartment", "suite"] },
  { key: "city", label: "City / settlement", hints: ["city", "citypcs", "municipality", "csdname", "town"] },
  { key: "postalCode", label: "Postal code", hints: ["postalcode", "postal", "postcode", "zip"] },
  { key: "ward", label: "Ward", hints: ["ward", "district"] },
  { key: "pollNumber", label: "Poll", hints: ["poll", "pollnumber", "subdivision"] },
  { key: "latitude", label: "Latitude", hints: ["latitude", "lat", "y"] },
  { key: "longitude", label: "Longitude", hints: ["longitude", "long", "lng", "lon", "x"] },
] as const;

type TargetKey = (typeof TARGETS)[number]["key"];
type Mapping = Partial<Record<TargetKey, string>>;

const CHUNK_SIZE = 250;

/**
 * Loads a municipal civic address file: every door in the municipality, with
 * coordinates. Doing this before the voters' list arrives means the map and the
 * street door-counts are complete from day one, and the voters' list then
 * attaches people to doors that already exist.
 */
export function AddressWizard() {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<AddressImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? [];
        if (fields.length === 0) {
          setParseError("No column headers found. The first row must name the columns.");
          return;
        }
        setHeaders(fields);
        setRows(parsed.data);
        setMapping(guessMapping(fields));
      },
      error: (error) => setParseError(error.message),
    });
  }

  function runImport() {
    const mapped: AddressRow[] = rows.map((row) => {
      const out: AddressRow = {};
      for (const target of TARGETS) {
        const source = mapping[target.key];
        if (source) out[target.key] = (row[source] ?? "").trim();
      }
      return out;
    });

    const totals: AddressImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      withCoordinates: 0,
      errors: [],
    };

    startTransition(async () => {
      setProgress({ done: 0, total: mapped.length });
      for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
        const partial = await importAddresses(mapped.slice(i, i + CHUNK_SIZE));
        totals.created += partial.created;
        totals.updated += partial.updated;
        totals.skipped += partial.skipped;
        totals.withCoordinates += partial.withCoordinates;
        totals.errors.push(...partial.errors);
        setProgress({ done: Math.min(i + CHUNK_SIZE, mapped.length), total: mapped.length });
      }
      setResult(totals);
      setProgress(null);
    });
  }

  const ready = Boolean(mapping.streetNumber && mapping.streetName);
  const hasCoords = Boolean(mapping.latitude && mapping.longitude);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Addresses loaded</p>
          <ul className="mt-2 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
            <li>{result.created.toLocaleString("en-CA")} new doors added</li>
            <li>{result.updated.toLocaleString("en-CA")} existing doors updated</li>
            <li>
              {result.withCoordinates.toLocaleString("en-CA")} came with coordinates — no
              geocoding needed
            </li>
            {result.skipped > 0 ? (
              <li>{result.skipped.toLocaleString("en-CA")} rows skipped</li>
            ) : null}
          </ul>
        </div>

        {result.errors.length > 0 ? (
          <details className="rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {result.errors.length} row problem{result.errors.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1 text-muted">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href="/map" className="btn-primary">
            See them on the map
          </Link>
          <Link href="/streets" className="btn-secondary">
            Door counts by street
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setResult(null);
              setHeaders(null);
              setRows([]);
            }}
          >
            Load another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="field"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {parseError ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{parseError}</p>
        ) : null}
      </div>

      {headers ? (
        <>
          <div>
            <h3 className="text-sm font-semibold">
              Match your columns ({rows.length.toLocaleString("en-CA")} addresses found)
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TARGETS.map((target) => (
                <label key={target.key} className="block">
                  <span className="field-label">{target.label}</span>
                  <select
                    className="field"
                    value={mapping[target.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [target.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— not imported —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {hasCoords ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              This file has coordinates, so these doors go straight onto the map.
              No Google geocoding, and no cost.
            </p>
          ) : (
            <p className="rounded-lg border border-line bg-raise px-3 py-2 text-xs text-muted">
              No coordinates mapped. The addresses will import fine, but they will
              need geocoding before they appear on the map.
            </p>
          )}

          {rows.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Preview</h3>
              <div className="table-scroll mt-2 rounded-lg border border-line">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="bg-raise">
                      {TARGETS.filter((t) => mapping[t.key]).map((t) => (
                        <th
                          key={t.key}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                        >
                          {t.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        {TARGETS.filter((t) => mapping[t.key]).map((t) => (
                          <td key={t.key} className="px-3 py-1.5">
                            {row[mapping[t.key] as string] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {progress ? (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
                <div
                  className="h-full bg-brand transition-[width]"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Loading {progress.done.toLocaleString("en-CA")} of{" "}
                {progress.total.toLocaleString("en-CA")}…
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !ready || rows.length === 0}
              onClick={runImport}
            >
              {pending
                ? "Loading…"
                : `Import ${rows.length.toLocaleString("en-CA")} addresses`}
            </button>
            {!ready ? (
              <span className="text-sm text-muted">
                Map a street number and street name first.
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();

  for (const target of TARGETS) {
    const match = headers.find((h) => {
      if (taken.has(h)) return false;
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      // Exact hits first so "street" does not steal the "street_no" column.
      return target.hints.some((hint) => norm === hint);
    }) ??
    headers.find((h) => {
      if (taken.has(h)) return false;
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      return target.hints.some((hint) => norm.includes(hint));
    });

    if (match) {
      mapping[target.key] = match;
      taken.add(match);
    }
  }
  return mapping;
}
