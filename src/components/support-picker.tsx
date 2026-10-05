"use client";

import { useState, useTransition } from "react";
import { setSupportLevel } from "@/app/actions/voters";
import { SUPPORT_LEVELS, SUPPORT_TEXT_COLORS, type SupportLevel } from "@/lib/enums";

/**
 * The support level as a dropdown, editable where it is read.
 *
 * A canvasser coming back from a street has a list of one-digit answers, and
 * opening each voter's form to record one is the slowest thing the app asks of
 * anyone. The select keeps the badge's colours so the column still scans as a
 * column, and saves on change — there is nothing else to fill in, so a save
 * button would only be one more thing to forget.
 */
export function SupportPicker({
  voterId,
  level,
}: {
  voterId: string;
  level: number | null;
}) {
  // Held locally so the colour and the wording follow the choice immediately,
  // rather than waiting for the server round trip and the page to revalidate.
  const [value, setValue] = useState<number | null>(level);
  const [pending, startTransition] = useTransition();

  const inRange = value !== null && value >= 1 && value <= 5;
  const tone = inRange
    ? SUPPORT_TEXT_COLORS[value as SupportLevel]
    : "text-muted bg-raise ring-line";

  return (
    <select
      aria-label="Support level"
      value={value === null ? "" : String(value)}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value === "" ? null : Number(e.target.value);
        setValue(next);
        startTransition(() => {
          void setSupportLevel(voterId, next);
        });
      }}
      className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset disabled:opacity-60 ${tone}`}
    >
      <option value="">Not IDed</option>
      {([1, 2, 3, 4, 5] as SupportLevel[]).map((n) => (
        <option key={n} value={n}>
          {SUPPORT_LEVELS[n]}
        </option>
      ))}
    </select>
  );
}
