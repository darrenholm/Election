"use client";

import { useState, useTransition } from "react";
import { createTextCampaign, previewAudience } from "@/app/actions/texting";
import { formatCents } from "@/lib/money";
import { SUPPORT_LEVEL_OPTIONS } from "@/lib/enums";

type Preview = Awaited<ReturnType<typeof previewAudience>>;

/**
 * Writing a bulk text.
 *
 * The preview is the point of this screen: how many people, what it actually
 * costs, and — because one curly apostrophe pasted from a word processor can
 * silently double the bill — which characters pushed the message out of the
 * cheap encoding.
 */
export function Composer({
  streets,
  turfs,
  eligible,
}: {
  streets: string[];
  turfs: { id: string; name: string }[];
  eligible: number;
}) {
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview(form: HTMLFormElement) {
    const data = new FormData(form);
    startTransition(async () => {
      setPreview(await previewAudience(data));
    });
  }

  return (
    <form action={createTextCampaign} className="space-y-5">
      <label className="block">
        <span className="field-label">Name this send</span>
        <input
          name="name"
          className="field"
          placeholder="Voting day reminder — supporters"
          required
        />
        <span className="mt-1 block text-xs text-muted">
          For your records only; recipients never see it.
        </span>
      </label>

      <label className="block">
        <span className="field-label">Message</span>
        <textarea
          name="body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field"
          placeholder="Hi {{firstName}}, voting is this Monday from 10am to 8pm at the Brockton Community Centre."
          required
        />
        <span className="mt-1 block text-xs text-muted">
          <code>{"{{firstName}}"}</code> and <code>{"{{lastName}}"}</code> are filled in
          per recipient. Your name and an opt-out line are added automatically —
          both are required, so they are not yours to leave off.
        </span>
      </label>

      <fieldset>
        <legend className="field-label">Who gets it</legend>
        <p className="mb-2 text-xs text-muted">
          {eligible.toLocaleString("en-CA")} voters have agreed to texts and have a
          usable number. Narrow further if you want.
        </p>

        <div className="space-y-3">
          <div>
            <span className="text-xs font-medium text-muted">Support level</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {SUPPORT_LEVEL_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="supportLevels"
                    value={o.value}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {turfs.length > 0 ? (
            <label className="block">
              <span className="text-xs font-medium text-muted">Turf</span>
              <select name="turfIds" multiple size={3} className="field mt-1">
                {turfs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {streets.length > 0 ? (
            <label className="block">
              <span className="text-xs font-medium text-muted">Streets</span>
              <select name="streets" multiple size={4} className="field mt-1">
                {streets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-muted">Tag contains</span>
            <input name="tag" className="field mt-1" placeholder="transit" />
          </label>
        </div>
      </fieldset>

      <button
        type="button"
        className="btn-secondary w-full"
        disabled={pending || body.trim() === ""}
        onClick={(e) => {
          const form = e.currentTarget.closest("form");
          if (form) runPreview(form);
        }}
      >
        {pending ? "Checking…" : "Preview audience and cost"}
      </button>

      {preview ? (
        <div className="space-y-3 rounded-lg border border-line bg-raise p-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Figure label="Recipients" value={preview.recipients.toLocaleString("en-CA")} />
            <Figure label="Segments each" value={String(preview.segments)} />
            <Figure label="Estimated cost" value={formatCents(preview.estimatedCostCents)} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              How it will arrive
            </p>
            <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-sm">{preview.sample}</p>
          </div>

          {preview.encoding === "UCS-2" ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              These characters put the message into the expensive encoding, which
              cuts each segment from 160 characters to 70:{" "}
              <strong>{preview.offenders.join(" ")}</strong>. Curly quotes and
              dashes pasted from a word processor are the usual culprits.
            </p>
          ) : null}

          {!preview.configured ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
              Twilio is not configured, so this will be a <strong>dry run</strong> —
              messages are recorded but nothing leaves the building. Useful for
              checking the audience before you open an account.
            </p>
          ) : null}

          {preview.recipients === 0 ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Nobody matches. Only voters who have agreed to texts, have a usable
              number and have not opted out are ever included.
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="queueNow"
          defaultChecked
          className="mt-0.5 size-4 accent-[var(--color-brand)]"
        />
        <span>
          <span className="font-medium">Queue it ready to send</span>
          <span className="mt-0.5 block text-xs text-muted">
            Nothing sends on its own — you press send on the next screen.
          </span>
        </span>
      </label>

      <button type="submit" className="btn-primary w-full" disabled={body.trim() === ""}>
        Create this send
      </button>
    </form>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
