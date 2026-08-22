"use client";

import Papa from "papaparse";
import Link from "next/link";
import { useState, useTransition } from "react";
import { importVoters, type ImportResult, type ImportRow } from "@/app/actions/voters";

/** The voter fields an import can populate, in the order they are mapped. */
const TARGETS = [
  { key: "externalId", label: "List ID", hints: ["voterid", "electorid", "id", "sequence"] },
  { key: "firstName", label: "First name", hints: ["first", "given", "firstname"] },
  { key: "lastName", label: "Last name", hints: ["last", "surname", "lastname", "family"] },
  { key: "streetNumber", label: "Street number", hints: ["streetnumber", "housenumber", "civic", "number", "stno"] },
  { key: "streetName", label: "Street name", hints: ["street", "streetname", "road", "address"] },
  { key: "unit", label: "Unit / apt", hints: ["unit", "apt", "apartment", "suite"] },
  { key: "city", label: "City", hints: ["city", "municipality", "town"] },
  { key: "postalCode", label: "Postal code", hints: ["postal", "postcode", "zip"] },
  { key: "ward", label: "Ward", hints: ["ward", "district"] },
  { key: "pollNumber", label: "Poll", hints: ["poll", "pollnumber", "subdivision"] },
  { key: "phone", label: "Phone", hints: ["phone", "telephone", "mobile", "cell"] },
  { key: "email", label: "Email", hints: ["email", "e-mail"] },
] as const;

type TargetKey = (typeof TARGETS)[number]["key"];
type Mapping = Partial<Record<TargetKey, string>>;

/** Rows per server action call — keeps each request comfortably small. */
const CHUNK_SIZE = 250;

export function ImportWizard({ showWards = false }: { showWards?: boolean }) {
  // A municipality without wards has no ward column to map, so it is dropped
  // from the target list entirely rather than shown and left blank.
  const targets = showWards ? TARGETS : TARGETS.filter((t) => t.key !== "ward");

  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
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
        setMapping(guessMapping(fields, targets));
      },
      error: (error) => setParseError(error.message),
    });
  }

  function runImport() {
    const mapped: ImportRow[] = rows.map((row) => {
      const out: ImportRow = {};
      for (const target of targets) {
        const source = mapping[target.key];
        if (source) out[target.key] = (row[source] ?? "").trim();
      }
      return out;
    });

    const totals: ImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      households: 0,
      errors: [],
    };

    startTransition(async () => {
      setProgress({ done: 0, total: mapped.length });
      for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
        const chunk = mapped.slice(i, i + CHUNK_SIZE);
        const partial = await importVoters(chunk);
        totals.created += partial.created;
        totals.updated += partial.updated;
        totals.skipped += partial.skipped;
        totals.households += partial.households;
        totals.errors.push(...partial.errors);
        setProgress({ done: Math.min(i + CHUNK_SIZE, mapped.length), total: mapped.length });
      }
      setResult(totals);
      setProgress(null);
    });
  }

  const namesMapped = Boolean(mapping.firstName || mapping.lastName);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Import finished</p>
          <ul className="mt-2 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
            <li>{result.created.toLocaleString("en-CA")} voters added</li>
            <li>{result.updated.toLocaleString("en-CA")} existing voters updated</li>
            <li>{result.households.toLocaleString("en-CA")} households created</li>
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

        <div className="flex gap-2">
          <Link href="/voters" className="btn-primary">
            Open the voter file
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
            Import another file
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
              Match your columns ({rows.length.toLocaleString("en-CA")} rows found)
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Anything left unmapped is ignored. First and last name are the
              minimum.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((target) => (
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

          {rows.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Preview</h3>
              <div className="table-scroll mt-2 rounded-lg border border-line">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="bg-raise">
                      {targets.filter((t) => mapping[t.key]).map((t) => (
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
                        {targets.filter((t) => mapping[t.key]).map((t) => (
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
                Importing {progress.done.toLocaleString("en-CA")} of{" "}
                {progress.total.toLocaleString("en-CA")}…
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !namesMapped || rows.length === 0}
              onClick={runImport}
            >
              {pending ? "Importing…" : `Import ${rows.length.toLocaleString("en-CA")} rows`}
            </button>
            {!namesMapped ? (
              <span className="text-sm text-muted">Map a first or last name column first.</span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Guess the mapping from header names so most lists need no manual work. */
function guessMapping(
  headers: string[],
  targets: readonly (typeof TARGETS)[number][],
): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();

  for (const target of targets) {
    const match = headers.find((h) => {
      if (taken.has(h)) return false;
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      return target.hints.some((hint) => norm === hint || norm.includes(hint));
    });
    if (match) {
      mapping[target.key] = match;
      taken.add(match);
    }
  }
  return mapping;
}
