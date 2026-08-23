"use client";

import { useState, useTransition } from "react";
import { clearMunicipalityAddresses } from "@/app/actions/municipalities";

/**
 * Undo for a bad import.
 *
 * Getting a bulk import wrong is easy — the wrong town ticked, the wrong
 * column mapped — and 10,000 rows is not something anyone is going to unpick by
 * hand. Two clicks, because it is destructive; the server refuses outright once
 * there is canvassing, electors or turf resting on those doors.
 */
export function ClearAddresses({
  municipalityId,
  name,
  doors,
}: {
  municipalityId: string;
  name: string;
  doors: number;
}) {
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  if (doors === 0) return null;

  if (!armed) {
    return (
      <div className="text-right">
        <button
          type="button"
          className="text-xs text-muted underline hover:text-ink"
          onClick={() => {
            setMessage("");
            setArmed(true);
          }}
        >
          Remove addresses
        </button>
        {message ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-xs text-muted">
        Delete all {doors.toLocaleString("en-CA")} addresses in {name}?
      </p>
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          className="text-xs font-semibold text-rose-600 underline disabled:opacity-50 dark:text-rose-400"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await clearMunicipalityAddresses(municipalityId);
              setArmed(false);
              setMessage("error" in result ? result.error : "");
            })
          }
        >
          {pending ? "Removing…" : "Yes, delete them"}
        </button>
        <button
          type="button"
          className="text-xs text-muted underline"
          disabled={pending}
          onClick={() => setArmed(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
