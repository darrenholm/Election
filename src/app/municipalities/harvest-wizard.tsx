"use client";

import Papa, { type ParseResult, type Parser } from "papaparse";
import { useRef, useState } from "react";
import { guessMunicipalityColumn, simplifyPlace, tidyPlaceName } from "@/lib/address";
import { harvestMunicipalities, type HarvestResult } from "@/app/actions/municipalities";
import { Note } from "@/components/ui";

/**
 * Bytes read to learn the column names.
 *
 * PapaParse only streams a local file when it is given a chunk callback;
 * without one it reads the whole file into a single JavaScript string. That is
 * wasteful at any size and outright broken past 512 MB, which is V8's maximum
 * string length — Chrome returns an empty string with no error, and the column
 * list comes back blank. Ontario's address file is 659 MB, so the header pass
 * is handed a slice off the front rather than the file itself.
 */
const HEADER_BYTES = 1024 * 1024;

/** The first HEADER_BYTES of a file, still typed as a File for PapaParse. */
function headSlice(file: File): File {
  return new File([file.slice(0, HEADER_BYTES)], file.name, { type: file.type });
}

/** Bytes of file handed to the parser at a time. */
const CHUNK_BYTES = 4 * 1024 * 1024;

type Phase = "choose" | "column" | "scanning" | "ready" | "saving" | "done";

type Place = { name: string; rows: number; onFile: boolean };

/**
 * Reads the municipality names out of an address file.
 *
 * The same streaming approach as the address importer — the province-wide file
 * is several hundred megabytes and is never held in memory — but this pass
 * keeps only the distinct values of the municipality column and how many
 * addresses each has. What comes back is the list of Ontario municipalities
 * that publish address data, which is then saved so every campaign can pick its
 * town from a list instead of typing it.
 */
export function HarvestWizard({ existingNames }: { existingNames: string[] }) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [column, setColumn] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ bytes: 0, rows: 0 });
  const [result, setResult] = useState<HarvestResult | null>(null);
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  const onFileKeys = useRef(new Set(existingNames.map(simplifyPlace)));

  function reset() {
    cancelled.current = true;
    setPhase("choose");
    setFile(null);
    setHeaders([]);
    setColumn("");
    setPlaces([]);
    setChosen(new Set());
    setProgress({ bytes: 0, rows: 0 });
    setResult(null);
    setError("");
  }

  /** Read only the first few rows, to learn the column names. */
  function pick(next: File) {
    cancelled.current = false;
    setFile(next);
    setError("");
    setResult(null);
    setPlaces([]);

    Papa.parse<Record<string, string>>(headSlice(next), {
      header: true,
      preview: 5,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        if (fields.length === 0) {
          setError("No column headers found. The first row of the file must name the columns.");
          return;
        }
        setHeaders(fields);
        setColumn(guessMunicipalityColumn(fields));
        setPhase("column");
      },
      error: (e) => setError(e.message),
    });
  }

  /** Full pass, counting addresses per municipality. */
  function scan() {
    if (!file || !column) return;
    cancelled.current = false;
    setPhase("scanning");
    setProgress({ bytes: 0, rows: 0 });

    const counts = new Map<string, number>();

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      chunkSize: CHUNK_BYTES,
      chunk: (results: ParseResult<Record<string, string>>, parser: Parser) => {
        if (cancelled.current) {
          parser.abort();
          return;
        }
        for (const row of results.data) {
          const raw = (row[column] ?? "").trim();
          if (raw === "") continue;
          // Counted against the tidied name, so "WEST GREY" and "West Grey" in
          // one file are a single town with the sum of their doors, not two.
          const name = tidyPlaceName(raw);
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        setProgress((p) => ({ bytes: results.meta.cursor, rows: p.rows + results.data.length }));
      },
      complete: () => {
        const list: Place[] = Array.from(counts.entries())
          .map(([name, rows]) => ({
            name,
            rows,
            onFile: onFileKeys.current.has(simplifyPlace(name)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "en-CA"));

        setPlaces(list);
        // Everything not already on file starts ticked: harvesting the whole
        // province in one go is the point of this page.
        setChosen(new Set(list.filter((p) => !p.onFile).map((p) => p.name)));
        setPhase("ready");
      },
      error: (e) => {
        setError(e.message);
        setPhase("column");
      },
    });
  }

  async function save() {
    setPhase("saving");
    setError("");
    const outcome = await harvestMunicipalities(Array.from(chosen));
    setResult(outcome);
    if (outcome.error) {
      setError(outcome.error);
      setPhase("ready");
      return;
    }
    // Anything just created is on file now, so a second run does not offer it.
    for (const name of chosen) onFileKeys.current.add(simplifyPlace(name));
    setPlaces((list) => list.map((p) => (chosen.has(p.name) ? { ...p, onFile: true } : p)));
    setChosen(new Set());
    setPhase("done");
  }

  const newCount = places.filter((p) => !p.onFile).length;
  const pct = file && file.size > 0 ? Math.min(100, (progress.bytes / file.size) * 100) : 0;

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {phase === "choose" ? (
        <>
          <label className="block">
            <span className="field-label">Address file (CSV)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="field"
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) pick(next);
              }}
            />
          </label>
          <Note>
            Use the same province-wide file you load addresses from. The file is
            read in your browser and never uploaded — only the list of
            municipality names is sent.
          </Note>
        </>
      ) : null}

      {phase === "column" ? (
        <>
          <p className="text-sm text-muted">
            <strong className="text-ink">{file?.name}</strong> —{" "}
            {file ? (file.size / 1024 / 1024).toFixed(0) : 0} MB
          </p>
          <label className="block">
            <span className="field-label">Column naming the municipality</span>
            <select
              className="field"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
            >
              <option value="">— choose a column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={!column} onClick={scan}>
              Read the municipality list
            </button>
            <button type="button" className="btn-secondary" onClick={reset}>
              Start over
            </button>
          </div>
        </>
      ) : null}

      {phase === "scanning" ? (
        <>
          <p className="text-sm text-muted">
            Reading {progress.rows.toLocaleString("en-CA")} addresses…
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
            <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="btn-secondary" onClick={reset}>
            Cancel
          </button>
        </>
      ) : null}

      {phase === "ready" || phase === "saving" || phase === "done" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <strong className="text-ink">{places.length.toLocaleString("en-CA")}</strong>{" "}
              municipalities in {progress.rows.toLocaleString("en-CA")} addresses —{" "}
              {newCount.toLocaleString("en-CA")} not yet on file.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setChosen(new Set(places.filter((p) => !p.onFile).map((p) => p.name)))
                }
              >
                Select all new
              </button>
              <button type="button" className="btn-secondary" onClick={() => setChosen(new Set())}>
                Clear
              </button>
            </div>
          </div>

          {result && !result.error ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Added {result.created.toLocaleString("en-CA")} municipalities.
              {result.alreadyOnFile > 0
                ? ` ${result.alreadyOnFile.toLocaleString("en-CA")} were already on file.`
                : ""}
            </p>
          ) : null}

          <div className="max-h-96 overflow-y-auto rounded-lg border border-line">
            <ul className="divide-y divide-line">
              {places.map((place) => (
                <li key={place.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={place.onFile || phase !== "ready"}
                    checked={chosen.has(place.name)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(place.name);
                        else next.delete(place.name);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{place.name}</span>
                  {place.onFile ? (
                    <span className="shrink-0 text-xs text-muted">on file</span>
                  ) : null}
                  <span className="shrink-0 tabular-nums text-muted">
                    {place.rows.toLocaleString("en-CA")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={chosen.size === 0 || phase === "saving"}
              onClick={save}
            >
              {phase === "saving"
                ? "Adding…"
                : `Add ${chosen.size.toLocaleString("en-CA")} municipalities`}
            </button>
            <button type="button" className="btn-secondary" onClick={reset}>
              Start over
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
