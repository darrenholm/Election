"use client";

import Papa from "papaparse";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  importVoters,
  planVoterImport,
  type ImportDecision,
  type ImportPlanRow,
  type ImportResult,
  type ImportRow,
} from "@/app/actions/voters";

/** The voter fields an import can populate, in the order they are mapped. */
const TARGETS = [
  { key: "lastName", label: "Last name", hints: ["lastname", "last", "surname", "family"] },
  { key: "firstName", label: "First name", hints: ["firstname", "first", "given", "givenname"] },
  { key: "middleName", label: "Middle name", hints: ["middlename", "middle", "middleinitial", "initial"] },
  { key: "externalId", label: "List ID", hints: ["voterid", "electorid", "listid", "sequence", "id"] },
  { key: "streetNumber", label: "Street number", hints: ["streetnumber", "streetno", "housenumber", "houseno", "civicnumber", "civicno", "civic", "number", "stno", "no"] },
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

/**
 * How many matched rows the review table draws.
 *
 * A re-issued list can match several thousand people and rendering a row each
 * makes the page unusable. The tick boxes still cover every match; this only
 * limits what is drawn.
 */
const REVIEW_LIMIT = 200;

/** A planned row paired with the mapped CSV row it came from. */
type Review = ImportPlanRow & {
  /** Index into the mapped rows, so a decision can be sent back in order. */
  index: number;
  /** An earlier row in this same file already claimed the matched voter. */
  repeat: boolean;
};

export function ImportWizard({ showWards = false }: { showWards?: boolean }) {
  // A municipality without wards has no ward column to map, so it is dropped
  // from the target list entirely rather than shown and left blank.
  const targets = showWards ? TARGETS : TARGETS.filter((t) => t.key !== "ward");

  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [mapped, setMapped] = useState<ImportRow[] | null>(null);
  const [review, setReview] = useState<Review[] | null>(null);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setHeaders(null);
    setRows([]);
    setMapping({});
    setMapped(null);
    setReview(null);
    setAccepted([]);
    setPlanError(null);
    setResult(null);
  }

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setReview(null);
    setMapped(null);
    setPlanError(null);
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

  /**
   * Ask the server what the import would do, before it does any of it.
   *
   * The file is planned in the same chunks it will be imported in, so the
   * server never sees it whole. Two rows matching the same voter can therefore
   * fall either side of a chunk boundary, which is why the claimed voters are
   * tracked out here rather than in the action.
   */
  function runPlan() {
    const prepared: ImportRow[] = rows.map((row) => {
      const out: ImportRow = {};
      for (const target of targets) {
        const source = mapping[target.key];
        if (source) out[target.key] = (row[source] ?? "").trim();
      }
      return out;
    });

    setPlanError(null);
    startTransition(async () => {
      setProgress({ label: "Checking against the voter file", done: 0, total: prepared.length });
      const claimed = new Set<string>();
      const collected: Review[] = [];

      for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
        const chunk = prepared.slice(i, i + CHUNK_SIZE);
        // The header is row 1, so the first data row is row 2.
        const plan = await planVoterImport(chunk, i + 2);
        if (plan.errors.length > 0) {
          setPlanError(plan.errors.join(" "));
          setProgress(null);
          return;
        }
        for (const [offset, planned] of plan.rows.entries()) {
          const repeat = planned.voterId !== null && claimed.has(planned.voterId);
          if (planned.voterId) claimed.add(planned.voterId);
          collected.push({ ...planned, index: i + offset, repeat });
        }
        setProgress({
          label: "Checking against the voter file",
          done: Math.min(i + CHUNK_SIZE, prepared.length),
          total: prepared.length,
        });
      }

      setMapped(prepared);
      setReview(collected);
      // Everything with something to do is ticked to start with. A row that
      // repeats a match already made earlier in the same file is not: applying
      // it twice would write one person's details over another's.
      setAccepted(collected.map((r) => !r.repeat && (r.action === "create" || r.changes.length > 0)));
      setProgress(null);
    });
  }

  function runImport() {
    if (!mapped || !review) return;

    const decisions: ImportDecision[] = review.map((r, i) => {
      if (!accepted[i]) return { action: "skip" };
      if (r.action === "update" && r.voterId) return { action: "update", voterId: r.voterId };
      return { action: "create" };
    });

    const totals: ImportResult = { created: 0, updated: 0, skipped: 0, households: 0, errors: [] };

    startTransition(async () => {
      setProgress({ label: "Importing", done: 0, total: mapped.length });
      for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
        const partial = await importVoters(
          mapped.slice(i, i + CHUNK_SIZE),
          decisions.slice(i, i + CHUNK_SIZE),
        );
        totals.created += partial.created;
        totals.updated += partial.updated;
        totals.skipped += partial.skipped;
        totals.households += partial.households;
        totals.errors.push(...partial.errors);
        setProgress({
          label: "Importing",
          done: Math.min(i + CHUNK_SIZE, mapped.length),
          total: mapped.length,
        });
      }
      setResult(totals);
      setProgress(null);
    });
  }

  const namesMapped = Boolean(mapping.firstName || mapping.lastName);

  // A list ID has digits in it. If the column mapped to List ID is all letters
  // it is almost certainly a name column, and importing it that way is quietly
  // destructive: externalId is unique per municipality and a match is treated
  // as "already on file", so the second Marie would overwrite the first.
  const idColumnLooksLikeNames = (() => {
    const source = mapping.externalId;
    if (!source) return false;
    const sample = rows
      .slice(0, 200)
      .map((r) => (r[source] ?? "").trim())
      .filter((v) => v !== "");
    if (sample.length < 5) return false;
    return sample.every((v) => /[A-Za-z]/.test(v) && !/[0-9]/.test(v));
  })();

  if (result) {
    return (
      <ResultPanel
        result={result}
        onAgain={() => {
          reset();
        }}
      />
    );
  }

  if (review) {
    return (
      <ReviewPanel
        review={review}
        accepted={accepted}
        setAccepted={setAccepted}
        progress={progress}
        pending={pending}
        onBack={() => {
          setReview(null);
          setMapped(null);
        }}
        onImport={runImport}
      />
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
          <p className="mt-2 text-sm text-accent-ink">{parseError}</p>
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

          {progress ? <ProgressBar progress={progress} /> : null}

          {planError ? (
            <p className="rounded-lg border border-accent/40 bg-accent-soft p-3 text-sm text-accent-ink">
              {planError}
            </p>
          ) : null}

          {idColumnLooksLikeNames ? (
            <p className="rounded-lg border border-accent/40 bg-accent-soft p-3 text-sm text-accent-ink">
              The column mapped to <strong>List ID</strong> ({mapping.externalId}) holds
              no numbers, so it looks like a name rather than an elector number.
              Importing it as the List ID will overwrite voters who share that
              value. Map it to a name field, or leave it unimported.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !namesMapped || rows.length === 0 || idColumnLooksLikeNames}
              onClick={runPlan}
            >
              {pending ? "Checking…" : `Check ${rows.length.toLocaleString("en-CA")} rows`}
            </button>
            {!namesMapped ? (
              <span className="text-sm text-muted">Map a first or last name column first.</span>
            ) : (
              <span className="text-sm text-muted">
                Nothing is written yet — the next screen shows what would change.
              </span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- review step */

function ReviewPanel({
  review,
  accepted,
  setAccepted,
  progress,
  pending,
  onBack,
  onImport,
}: {
  review: Review[];
  accepted: boolean[];
  setAccepted: (next: boolean[]) => void;
  progress: { label: string; done: number; total: number } | null;
  pending: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const groups = useMemo(() => {
    const additions: Review[] = [];
    const updates: Review[] = [];
    const unchanged: Review[] = [];
    const uncertain: Review[] = [];

    for (const row of review) {
      if (row.repeat) uncertain.push(row);
      else if (row.action === "create" && row.rivals > 0) uncertain.push(row);
      else if (row.action === "create") additions.push(row);
      else if (row.changes.length > 0) updates.push(row);
      else unchanged.push(row);
    }
    return { additions, updates, unchanged, uncertain };
  }, [review]);

  const ticked = accepted.filter(Boolean).length;

  function setAll(subset: Review[], value: boolean) {
    const next = [...accepted];
    const positions = new Map(review.map((r, i) => [r, i] as const));
    for (const row of subset) {
      const at = positions.get(row);
      if (at !== undefined) next[at] = value;
    }
    setAccepted(next);
  }

  function toggle(row: Review, value: boolean) {
    const at = review.indexOf(row);
    if (at === -1) return;
    const next = [...accepted];
    next[at] = value;
    setAccepted(next);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-raise p-4">
        <p className="font-semibold">What this file would do</p>
        <ul className="mt-2 space-y-0.5 text-sm">
          <li>
            <strong>{groups.additions.length.toLocaleString("en-CA")}</strong> new voters
            to add
          </li>
          <li>
            <strong>{groups.updates.length.toLocaleString("en-CA")}</strong> already on
            file, with details that have changed
          </li>
          <li>
            <strong>{groups.unchanged.length.toLocaleString("en-CA")}</strong> already on
            file and unchanged — nothing to do
          </li>
          {groups.uncertain.length > 0 ? (
            <li className="text-accent-ink">
              <strong>{groups.uncertain.length.toLocaleString("en-CA")}</strong> that need
              your eye
            </li>
          ) : null}
        </ul>
      </div>

      {groups.uncertain.length > 0 ? (
        <Section
          title="Need your eye"
          hint="The name matches more than one person on file, or appears twice in this file. Ticked, these are added as new people; unticked, they are left out."
          rows={groups.uncertain}
          accepted={accepted}
          review={review}
          onToggle={toggle}
          onAll={(v) => setAll(groups.uncertain, v)}
          tone="warn"
        />
      ) : null}

      {groups.updates.length > 0 ? (
        <Section
          title="Already on file — details changed"
          hint="Only the fields listed are written. Anything this file does not carry is left alone. Untick to leave a voter exactly as they are."
          rows={groups.updates}
          accepted={accepted}
          review={review}
          onToggle={toggle}
          onAll={(v) => setAll(groups.updates, v)}
        />
      ) : null}

      {groups.additions.length > 0 ? (
        <Section
          title="New voters"
          hint="No one on file matches these by list ID or by name."
          rows={groups.additions}
          accepted={accepted}
          review={review}
          onToggle={toggle}
          onAll={(v) => setAll(groups.additions, v)}
        />
      ) : null}

      {progress ? <ProgressBar progress={progress} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || ticked === 0}
          onClick={onImport}
        >
          {pending ? "Importing…" : `Apply ${ticked.toLocaleString("en-CA")} changes`}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onBack}>
          Back to the columns
        </button>
        {ticked === 0 ? (
          <span className="text-sm text-muted">Nothing is ticked.</span>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  rows,
  review,
  accepted,
  onToggle,
  onAll,
  tone,
}: {
  title: string;
  hint: string;
  rows: Review[];
  review: Review[];
  accepted: boolean[];
  onToggle: (row: Review, value: boolean) => void;
  onAll: (value: boolean) => void;
  tone?: "warn";
}) {
  const shown = rows.slice(0, REVIEW_LIMIT);

  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn" ? "border-accent/40 bg-accent-soft" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title} ({rows.length.toLocaleString("en-CA")})
        </h3>
        <div className="flex gap-2 text-xs">
          <button type="button" className="underline" onClick={() => onAll(true)}>
            Tick all
          </button>
          <button type="button" className="underline" onClick={() => onAll(false)}>
            Untick all
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>

      <ul className="mt-3 space-y-2">
        {shown.map((row) => {
          const at = review.indexOf(row);
          return (
            <li key={row.row} className="rounded border border-line bg-surface p-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={accepted[at] ?? false}
                  onChange={(e) => onToggle(row, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-medium">
                    Row {row.row}
                    {row.existingName ? ` — ${row.existingName}` : ""}
                  </span>
                  {row.existingAddress ? (
                    <span className="text-muted"> · {row.existingAddress}</span>
                  ) : null}
                  {row.matchedBy ? (
                    <span className="text-muted">
                      {" "}
                      · matched on {MATCH_LABELS[row.matchedBy]}
                    </span>
                  ) : null}
                  {row.repeat ? (
                    <span className="text-accent-ink">
                      {" "}
                      · an earlier row in this file already matched this voter
                    </span>
                  ) : null}
                  {row.rivals > 0 ? (
                    <span className="text-accent-ink">
                      {" "}
                      · {row.rivals} people on file share this name
                    </span>
                  ) : null}
                  {row.changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {row.changes.map((c) => (
                        <li key={c.field}>
                          {c.label}: {c.from === "" ? "—" : c.from} → <strong>{c.to}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {rows.length > shown.length ? (
        <p className="mt-2 text-xs text-muted">
          Showing the first {REVIEW_LIMIT.toLocaleString("en-CA")}. Tick all and untick
          all still cover every one of the {rows.length.toLocaleString("en-CA")}.
        </p>
      ) : null}
    </div>
  );
}

const MATCH_LABELS: Record<NonNullable<ImportPlanRow["matchedBy"]>, string> = {
  listId: "list ID",
  nameAndAddress: "name and address",
  name: "name",
};

/* ------------------------------------------------------------------ pieces */

function ProgressBar({ progress }: { progress: { label: string; done: number; total: number } }) {
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
        <div
          className="h-full bg-brand transition-[width]"
          style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {progress.label} {progress.done.toLocaleString("en-CA")} of{" "}
        {progress.total.toLocaleString("en-CA")}…
      </p>
    </div>
  );
}

function ResultPanel({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
        <p className="font-semibold text-brand-ink">Import finished</p>
        <ul className="mt-2 space-y-0.5 text-sm text-brand-ink">
          <li>{result.created.toLocaleString("en-CA")} voters added</li>
          <li>{result.updated.toLocaleString("en-CA")} existing voters updated</li>
          <li>{result.households.toLocaleString("en-CA")} households created</li>
          {result.skipped > 0 ? (
            <li>{result.skipped.toLocaleString("en-CA")} rows left alone</li>
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
        <button type="button" className="btn-secondary" onClick={onAgain}>
          Import another file
        </button>
      </div>
    </div>
  );
}

/**
 * Split a header into whole words: "Middle Name" -> ["middle", "name"], and
 * also the run-together form ("middlename") so "MiddleName" still matches.
 *
 * Matching used to be a plain substring test, which is how a clerk's "Middle
 * Name" column ended up mapped to List ID: "middlename" contains "id". Names
 * imported into externalId then collided on the municipality/externalId unique
 * key and quietly overwrote each other, so this stays word-based.
 */
function headerWords(header: string): Set<string> {
  const words = header
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return new Set([...words, words.join("")]);
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
      const words = headerWords(h);
      return target.hints.some((hint) => words.has(hint));
    });
    if (match) {
      mapping[target.key] = match;
      taken.add(match);
    }
  }
  return mapping;
}
