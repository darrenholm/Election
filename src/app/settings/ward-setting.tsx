"use client";

import { useState } from "react";
import { Field } from "@/components/ui";

/**
 * Wards are a per-municipality fact, not a universal one — plenty of Ontario
 * municipalities elect council at large. The ward name input reveals itself
 * only when wards are switched on, so a campaign that does not use them never
 * sees the field.
 */
export function WardSetting({
  usesWards,
  ward,
}: {
  usesWards: boolean;
  ward: string;
}) {
  const [enabled, setEnabled] = useState(usesWards);

  return (
    <>
      <label className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="usesWards"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 size-4 rounded border-line accent-[var(--color-brand)]"
        />
        <span>
          <span className="font-medium">This municipality is divided into wards</span>
          <span className="mt-0.5 block text-xs text-muted">
            Leave this off if council is elected at large. Ward fields, filters
            and groupings are hidden throughout the app when it is off, and run
            sheets group by street instead.
          </span>
        </span>
      </label>

      {enabled ? (
        <Field label="Ward or district">
          <input name="ward" defaultValue={ward} className="field" placeholder="Ward 3" />
        </Field>
      ) : null}
    </>
  );
}
