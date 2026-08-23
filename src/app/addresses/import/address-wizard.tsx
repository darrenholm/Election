"use client";

import Papa, { type ParseResult, type Parser } from "papaparse";
import Link from "next/link";
import { useRef, useState } from "react";
import { importAddresses, type AddressImportResult, type AddressRow } from "@/app/actions/voters";
import { guessMunicipalityColumn, simplifyPlace } from "@/lib/address";

/** The household fields a civic address file can populate. */
const TARGETS = [
  { key: "streetNumber", label: "Street number", hints: ["streetno", "streetnumber", "civicnumber", "housenumber", "number", "stno", "civic"] },
  { key: "streetName", label: "Street name", hints: ["street", "streetname", "strname", "road"] },
  { key: "unit", label: "Unit / apt", hints: ["unit", "apt", "apartment", "suite"] },
  { key: "city", label: "City / settlement", hints: ["city", "citypcs", "town"] },
  { key: "postalCode", label: "Postal code", hints: ["postalcode", "postal", "postcode", "zip"] },
  { key: "ward", label: "Ward", hints: ["ward"] },
  { key: "pollNumber", label: "Poll", hints: ["poll", "pollnumber", "subdivision"] },
  { key: "latitude", label: "Latitude", hints: ["latitude", "lat"] },
  { key: "longitude", label: "Longitude", hints: ["longitude", "long", "lng", "lon"] },
] as const;

type TargetKey = (typeof TARGETS)[number]["key"];
type Mapping = Partial<Record<TargetKey, string>>;

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

/** Rows sent to the server per call. */
const BATCH = 400;
/** Bytes of file handed to the parser at a time. */
const CHUNK_BYTES = 4 * 1024 * 1024;

type Phase = "choose" | "map" | "scanning" | "ready" | "importing" | "done";

/**
 * Loads a civic address file, up to and including a whole province.
 *
 * Statistics Canada publishes Ontario as one CSV of several hundred megabytes,
 * and a campaign only wants one municipality out of it. So the file is never
 * read into memory: PapaParse streams it in chunks, the parser is paused while
 * each batch is sent, and only rows matching the chosen municipality are kept.
 * That keeps a 650 MB file to a few megabytes of browser memory and means
 * nobody has to pre-filter anything on the command line.
 */
export function AddressWizard({
  targetMunicipality,
}: {
  targetMunicipality: string;
}) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [municipalityColumn, setMunicipalityColumn] = useState<string>("");
  const [places, setPlaces] = useState<{ name: string; rows: number }[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ bytes: 0, rows: 0, matched: 0 });
  const [result, setResult] = useState<AddressImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  function reset() {
    cancelled.current = false;
    setPhase("choose");
    setFile(null);
    setHeaders([]);
    setMapping({});
    setMunicipalityColumn("");
    setPlaces([]);
    setChosen(new Set());
    setProgress({ bytes: 0, rows: 0, matched: 0 });
    setResult(null);
    setError(null);
  }

  /** Read only the first rows, to learn the column names without a full pass. */
  function handleFile(picked: File) {
    setError(null);
    setFile(picked);
    Papa.parse<Record<string, string>>(headSlice(picked), {
      header: true,
      preview: 20,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? [];
        if (fields.length === 0) {
          setError("No column headers found. The first row must name the columns.");
          return;
        }
        setHeaders(fields);
        setMapping(guessMapping(fields));
        setMunicipalityColumn(guessMunicipalityColumn(fields));
        setPhase("map");
      },
      error: (e) => setError(e.message),
    });
  }

  /** Full pass counting rows per municipality, so the user can pick from a list. */
  function scan() {
    if (!file || !municipalityColumn) return;
    cancelled.current = false;
    setPhase("scanning");
    setProgress({ bytes: 0, rows: 0, matched: 0 });

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
          const place = (row[municipalityColumn] ?? "").trim();
          if (place === "") continue;
          counts.set(place, (counts.get(place) ?? 0) + 1);
        }
        setProgress((p) => ({
          bytes: results.meta.cursor,
          rows: p.rows + results.data.length,
          matched: 0,
        }));
      },
      complete: () => {
        const list = Array.from(counts.entries())
          .map(([name, rows]) => ({ name, rows }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setPlaces(list);

        // Pre-select the campaign's own municipality, which is nearly always
        // what they are here to load.
        //
        // Matched whole, never as a substring. A substring test looks helpful
        // and is actively dangerous here: "brockton".includes("brock") is true,
        // so a campaign in Brockton would silently arrive with Brock's 5,624
        // addresses ticked alongside its own — a township two hundred
        // kilometres away, and no obvious sign it had happened.
        const target = simplifyPlace(targetMunicipality);
        const guess = list.filter((p) => simplifyPlace(p.name) === target);
        setChosen(new Set(guess.map((g) => g.name)));
        setPhase("ready");
      },
      error: (e) => {
        setError(e.message);
        setPhase("map");
      },
    });
  }

  /** Second pass: keep matching rows, map them, and send in batches. */
  function run() {
    if (!file) return;
    cancelled.current = false;
    setPhase("importing");
    setProgress({ bytes: 0, rows: 0, matched: 0 });

    const totals: AddressImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      withCoordinates: 0,
      errors: [],
    };

    // Filtering is optional: a file already narrowed to one municipality can be
    // loaded whole, without scanning it first.
    const filtering = chosen.size > 0 && municipalityColumn !== "";
    let buffer: AddressRow[] = [];

    const send = async (rows: AddressRow[]) => {
      const partial = await importAddresses(rows);
      totals.created += partial.created;
      totals.updated += partial.updated;
      totals.skipped += partial.skipped;
      totals.withCoordinates += partial.withCoordinates;
      if (partial.errors.length > 0 && totals.errors.length < 20) {
        totals.errors.push(...partial.errors);
      }
    };

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
          if (filtering && !chosen.has((row[municipalityColumn] ?? "").trim())) continue;
          const out: AddressRow = {};
          for (const target of TARGETS) {
            const source = mapping[target.key];
            if (source) out[target.key] = (row[source] ?? "").trim();
          }
          buffer.push(out);
        }

        setProgress((p) => ({
          bytes: results.meta.cursor,
          rows: p.rows + results.data.length,
          matched: p.matched + buffer.length,
        }));

        if (buffer.length === 0) return;

        // Pause while uploading, so a fast disk cannot outrun the database.
        parser.pause();
        const pending = buffer;
        buffer = [];
        void (async () => {
          try {
            for (let i = 0; i < pending.length; i += BATCH) {
              await send(pending.slice(i, i + BATCH));
            }
          } catch (e) {
            totals.errors.push(e instanceof Error ? e.message : "Upload failed");
          } finally {
            parser.resume();
          }
        })();
      },
      complete: () => {
        void (async () => {
          if (buffer.length > 0 && !cancelled.current) {
            for (let i = 0; i < buffer.length; i += BATCH) {
              await send(buffer.slice(i, i + BATCH));
            }
          }
          setResult(totals);
          setPhase("done");
        })();
      },
      error: (e) => {
        setError(e.message);
        setPhase("ready");
      },
    });
  }

  const readyToImport = Boolean(mapping.streetNumber && mapping.streetName);
  const hasCoords = Boolean(mapping.latitude && mapping.longitude);
  const pct = file && file.size > 0 ? Math.min(100, (progress.bytes / file.size) * 100) : 0;

  /* ------------------------------------------------------------- finished */

  if (phase === "done" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
          <p className="font-semibold text-brand-ink">
            Loaded into {targetMunicipality}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-brand-ink">
            <li>{result.created.toLocaleString("en-CA")} new doors added</li>
            <li>{result.updated.toLocaleString("en-CA")} existing doors updated</li>
            <li>
              {result.withCoordinates.toLocaleString("en-CA")} came with coordinates — no
              geocoding needed
            </li>
            {result.skipped > 0 ? (
              <li>
                {result.skipped.toLocaleString("en-CA")} rows skipped (no street, or a
                duplicate of another row)
              </li>
            ) : null}
          </ul>
        </div>

        {result.errors.length > 0 ? (
          <details className="rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {result.errors.length} problem{result.errors.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1 text-muted">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
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
          <button type="button" className="btn-secondary" onClick={reset}>
            Load another file
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ in flight */

  if (phase === "scanning" || phase === "importing") {
    const scanning = phase === "scanning";
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium">
            {scanning ? "Reading the file…" : `Loading into ${targetMunicipality}…`}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-raise">
            <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {pct.toFixed(1)}% · {progress.rows.toLocaleString("en-CA")} rows read
            {!scanning ? ` · ${progress.matched.toLocaleString("en-CA")} matched` : ""}
          </p>
          <p className="mt-2 text-xs text-muted">
            The file is read in pieces and never held in memory, so a
            province-sized one is fine — it just takes a few minutes. Leave this
            tab open.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            cancelled.current = true;
          }}
        >
          Stop
        </button>
      </div>
    );
  }

  /* -------------------------------------------------------------- choose */

  return (
    <div className="space-y-6">
      <div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="field"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) handleFile(picked);
          }}
        />
        {file ? (
          <p className="mt-1 text-xs text-muted">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-accent-ink">{error}</p>
        ) : null}
      </div>

      {phase !== "choose" && headers.length > 0 ? (
        <>
          <div>
            <h3 className="text-sm font-semibold">Match your columns</h3>
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
            <p className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-xs text-brand-ink">
              This file has coordinates, so these doors go straight onto the map.
              No geocoding, and no cost.
            </p>
          ) : (
            <p className="rounded-lg border border-line bg-raise px-3 py-2 text-xs text-muted">
              No coordinates mapped. The addresses will import fine, but they will
              need geocoding before they appear on the map.
            </p>
          )}

          <div className="rounded-lg border border-line p-3">
            <h3 className="text-sm font-semibold">Which municipality?</h3>
            <p className="mt-0.5 text-xs text-muted">
              A provincial file covers hundreds. Everything you load here is
              attached to <strong>{targetMunicipality}</strong>, so pick the rows
              that belong to it.
            </p>

            <label className="mt-3 block">
              <span className="field-label">Column naming the municipality</span>
              <select
                className="field"
                value={municipalityColumn}
                onChange={(e) => {
                  setMunicipalityColumn(e.target.value);
                  setPlaces([]);
                  setChosen(new Set());
                }}
              >
                <option value="">— the file is already one municipality —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>

            {municipalityColumn && places.length === 0 ? (
              <button type="button" className="btn-secondary mt-3 w-full" onClick={scan}>
                Scan the file for municipalities
              </button>
            ) : null}

            {places.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-muted">
                  {places.length.toLocaleString("en-CA")} found. Tick the ones to load.
                </p>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded border border-line p-2">
                  {places.map((place) => (
                    <label key={place.name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={chosen.has(place.name)}
                        onChange={(e) =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(place.name);
                            else next.delete(place.name);
                            return next;
                          })
                        }
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      <span className="flex-1">{place.name}</span>
                      <span className="tabular-nums text-xs text-muted">
                        {place.rows.toLocaleString("en-CA")}
                      </span>
                    </label>
                  ))}
                </div>
                {chosen.size > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    {Array.from(chosen)
                      .map(
                        (name) =>
                          `${name} (${(places.find((p) => p.name === name)?.rows ?? 0).toLocaleString("en-CA")})`,
                      )
                      .join(", ")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-accent-ink">
                    Nothing ticked — the whole file would be loaded.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!readyToImport}
            onClick={run}
          >
            {chosen.size > 0
              ? `Import ${Array.from(chosen)
                  .reduce((n, name) => n + (places.find((p) => p.name === name)?.rows ?? 0), 0)
                  .toLocaleString("en-CA")} addresses`
              : "Import the whole file"}
          </button>
          {!readyToImport ? (
            <p className="text-sm text-muted">
              Map a street number and street name before importing.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();

  for (const target of TARGETS) {
    const exact = headers.find((h) => {
      if (taken.has(h)) return false;
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      return target.hints.some((hint) => norm === hint);
    });
    const loose =
      exact ??
      headers.find((h) => {
        if (taken.has(h)) return false;
        const norm = h.toLowerCase().replace(/[^a-z]/g, "");
        return target.hints.some((hint) => norm.includes(hint));
      });

    if (loose) {
      mapping[target.key] = loose;
      taken.add(loose);
    }
  }
  return mapping;
}

