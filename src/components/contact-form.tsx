"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTACT_METHOD_OPTIONS,
  CONTACT_RESULT_OPTIONS,
  SUPPORT_LEVEL_OPTIONS,
} from "@/lib/enums";
import { DOOR_CONSENT_SCRIPT, isTextableNumber } from "@/lib/consent";
import { enqueue, flushOutbox, newClientId, type QueuedContact } from "@/lib/outbox";

type Volunteer = { id: string; firstName: string; lastName: string };

type Saved = "idle" | "saving" | "saved" | "queued" | "error";

/**
 * Logging a door.
 *
 * Posts to /api/contacts rather than using a server action so that a failure
 * is catchable: when the network is not there, the contact goes into the local
 * outbox and the canvasser is told it is held, not lost. On a good signal the
 * queue is emptied in the same breath and nothing lingers.
 */
export function ContactForm({
  voterId,
  volunteers,
  defaultVolunteerId,
  defaultMethod = "DOOR",
  compact = false,
  knownPhone = "",
  knownEmail = "",
  smsConsent = "UNKNOWN",
}: {
  voterId: string;
  volunteers: Volunteer[];
  defaultVolunteerId?: string | null;
  defaultMethod?: string;
  compact?: boolean;
  knownPhone?: string;
  knownEmail?: string;
  smsConsent?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<Saved>("idle");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState<"UNKNOWN" | "GRANTED" | "DECLINED">("UNKNOWN");

  const alreadyAsked = smsConsent === "GRANTED" || smsConsent === "DECLINED";
  const phoneOnFile = knownPhone.trim() !== "";
  const phoneForConsent = phone.trim() || knownPhone.trim();
  const consentUsable = isTextableNumber(phoneForConsent);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const supportRaw = String(data.get("supportLevel") ?? "");
    const item: QueuedContact = {
      clientId: newClientId(),
      voterId,
      volunteerId: (String(data.get("volunteerId") ?? "") || null) as string | null,
      method: String(data.get("method") ?? defaultMethod),
      result: String(data.get("result") ?? "SPOKE"),
      supportLevel: supportRaw === "" ? null : Number(supportRaw),
      wantsSign: data.get("wantsSign") === "on",
      wantsToVolunteer: data.get("wantsToVolunteer") === "on",
      isDonorProspect: data.get("isDonorProspect") === "on",
      markDoNotContact: data.get("markDoNotContact") === "on",
      phone: String(data.get("phone") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      smsConsent: consent,
      smsConsentWording: consent === "UNKNOWN" ? "" : DOOR_CONSENT_SCRIPT,
      notes: String(data.get("notes") ?? ""),
      occurredAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: "",
    };

    setState("saving");
    setMessage("");

    // Queue first, then try to send. If the phone dies mid-request the door is
    // already safe on the device.
    enqueue(item);

    try {
      const result = await flushOutbox();
      if (result.remaining === 0) {
        setState("saved");
        setMessage("Saved.");
        form.reset();
        setPhone("");
        setConsent("UNKNOWN");
        router.refresh();
      } else {
        setState("queued");
        setMessage(
          `Held on this phone — ${result.remaining} waiting to upload. It will send itself when you have signal.`,
        );
        form.reset();
        setPhone("");
        setConsent("UNKNOWN");
      }
    } catch {
      setState("queued");
      setMessage("Held on this phone. It will send itself when you have signal.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
        <label className="block">
          <span className="field-label">Result</span>
          <select name="result" defaultValue="SPOKE" className="field">
            {CONTACT_RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Support level</span>
          <select name="supportLevel" defaultValue="" className="field">
            <option value="">No change</option>
            {SUPPORT_LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {!compact ? (
          <label className="block">
            <span className="field-label">Method</span>
            <select name="method" defaultValue={defaultMethod} className="field">
              {CONTACT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="method" value={defaultMethod} />
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Check name="wantsSign" label="Wants a sign" />
        <Check name="wantsToVolunteer" label="Will volunteer" />
        <Check name="isDonorProspect" label="Might donate" />
      </div>

      <fieldset className="rounded-lg border border-line bg-canvas p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Contact details
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">
              Mobile {phoneOnFile ? <span className="normal-case">(on file: {knownPhone})</span> : null}
            </span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="519-555-0134"
              className="field"
            />
          </label>
          <label className="block">
            <span className="field-label">
              Email {knownEmail ? <span className="normal-case">(on file)</span> : "(optional)"}
            </span>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="optional"
              className="field"
            />
          </label>
        </div>

        {alreadyAsked ? (
          <p className="mt-3 text-xs text-muted">
            Text consent already recorded as{" "}
            <strong>{smsConsent === "GRANTED" ? "yes" : "no"}</strong> — no need to ask again.
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Ask about texts
            </p>
            <p className="mt-1 rounded-lg bg-raise px-2.5 py-2 text-sm italic">
              &ldquo;{DOOR_CONSENT_SCRIPT}&rdquo;
            </p>
            <div className="mt-2 flex gap-2">
              <ConsentButton
                active={consent === "GRANTED"}
                disabled={!consentUsable}
                tone="good"
                onClick={() => setConsent(consent === "GRANTED" ? "UNKNOWN" : "GRANTED")}
              >
                Said yes
              </ConsentButton>
              <ConsentButton
                active={consent === "DECLINED"}
                tone="bad"
                onClick={() => setConsent(consent === "DECLINED" ? "UNKNOWN" : "DECLINED")}
              >
                Said no
              </ConsentButton>
            </div>
            {!consentUsable && consent !== "DECLINED" ? (
              <p className="mt-1.5 text-xs text-muted">
                Enter a mobile number before recording a yes — consent has to
                belong to a number.
              </p>
            ) : null}
          </div>
        )}
      </fieldset>

      <label className="block">
        <span className="field-label">Notes</span>
        <textarea
          name="notes"
          rows={compact ? 2 : 3}
          className="field"
          placeholder="Issues raised, follow-ups, anything worth remembering."
        />
      </label>

      {!compact ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Canvasser</span>
            <select name="volunteerId" defaultValue={defaultVolunteerId ?? ""} className="field">
              <option value="">Not recorded</option>
              {volunteers.map((v) => (
                <option key={v.id} value={v.id}>
                  {`${v.firstName} ${v.lastName}`.trim()}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <input type="hidden" name="volunteerId" value={defaultVolunteerId ?? ""} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "saving"} className="btn-primary">
          {state === "saving" ? "Saving…" : "Save contact"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            name="markDoNotContact"
            className="size-4 accent-[var(--color-brand)]"
          />
          Also mark do-not-contact
        </label>
      </div>

      {message ? (
        <p
          className={`text-sm ${
            state === "queued"
              ? "text-amber-700 dark:text-amber-300"
              : state === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <input type="checkbox" name={name} className="size-4 rounded border-line accent-[var(--color-brand)]" />
      <span>{label}</span>
    </label>
  );
}

function ConsentButton({
  active,
  disabled,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  tone: "good" | "bad";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "good"
      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
        active ? activeClass : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
