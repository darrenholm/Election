"use client";

import { useState } from "react";
import { Field } from "@/components/ui";

/**
 * Which municipality the candidate is running in, and — separately — what that
 * municipality is called.
 *
 * These are two different acts and were previously one confusing text box.
 * Choosing from the list *moves* this campaign. Renaming changes the town's
 * name for every campaign running there, which is why it is tucked away rather
 * than sitting in the main flow.
 */
export function MunicipalitySetting({
  currentId,
  currentName,
  municipalities,
  usesWards,
  ward,
  canMove,
}: {
  currentId: string;
  currentName: string;
  municipalities: { id: string; name: string; campaigns: number }[];
  usesWards: boolean;
  ward: string;
  canMove: boolean;
}) {
  const [choice, setChoice] = useState(currentId);
  const [wardsOn, setWardsOn] = useState(usesWards);

  const moving = choice !== currentId;
  const shared = (municipalities.find((m) => m.id === currentId)?.campaigns ?? 1) > 1;

  return (
    <>
      <Field
        label="Municipality"
        hint="Where this candidate is running. Doors and electors come from here."
        className="sm:col-span-2"
      >
        <select
          name="municipalityChoice"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="field"
        >
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.campaigns > 1 ? ` — ${m.campaigns} campaigns` : ""}
            </option>
          ))}
          <option value="__new__">— add a new municipality —</option>
        </select>
      </Field>

      {choice === "__new__" ? (
        <Field label="New municipality name" className="sm:col-span-2">
          <input
            name="newMunicipalityName"
            className="field"
            placeholder="Municipality of West Grey"
            autoFocus
          />
        </Field>
      ) : null}

      {moving && canMove ? (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent-ink sm:col-span-2">
          This moves the campaign. Its doors and electors will come from the new
          municipality instead.
        </p>
      ) : null}

      {moving && !canMove ? (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent-ink sm:col-span-2">
          This campaign already has canvassing data for {currentName}. Moving it
          would leave that describing the wrong town, so the save will be
          refused — create a fresh campaign in the right municipality instead.
        </p>
      ) : null}

      <label className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="usesWards"
          checked={wardsOn}
          onChange={(e) => setWardsOn(e.target.checked)}
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

      {wardsOn ? (
        <Field label="Ward or district">
          <input name="ward" defaultValue={ward} className="field" placeholder="Ward 3" />
        </Field>
      ) : null}

      {choice !== "__new__" ? (
        <details className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2">
          <summary className="cursor-pointer text-muted">
            Fix a typo in the name &ldquo;{currentName}&rdquo;
          </summary>
          <div className="mt-3">
            <Field
              label="Rename this municipality"
              hint={
                shared
                  ? "This town's name is shared — renaming it changes it for every campaign running there. It does not move this candidate."
                  : "Changes the town's name. It does not move this candidate to a different town."
              }
            >
              <input
                name="renameMunicipality"
                defaultValue={currentName}
                className="field"
              />
            </Field>
          </div>
        </details>
      ) : null}
    </>
  );
}
