"use client";

import { useState } from "react";
import { savePlan } from "@/app/actions/social";
import { POST_KIND_OPTIONS } from "@/lib/enums";
import { Field } from "@/components/ui";

const WEEKDAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];

function DayPicker({ name, selected }: { name: string; selected: string[] }) {
  // Held in state only so the count in the label keeps up; the form still
  // posts plain checkboxes.
  const [chosen, setChosen] = useState<string[]>(selected);

  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((day) => {
        const on = chosen.includes(day.value);
        return (
          <label
            key={day.value}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
              on ? "bg-brand text-white ring-brand" : "bg-raise text-muted ring-line"
            }`}
          >
            <input
              type="checkbox"
              name={name}
              value={day.value}
              defaultChecked={on}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, day.value]
                    : current.filter((v) => v !== day.value),
                )
              }
              className="sr-only"
            />
            {day.label}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Setting the cadence.
 *
 * Two rows of day pills and a time. Everything else about the schedule follows
 * from those, which is the point — a candidate deciding "Mondays, Wednesdays,
 * Fridays, and daily for the last fortnight" should not have to think about
 * anything else.
 */
export function PlanForm({
  plan,
}: {
  plan: {
    daysOfWeek: string[];
    timeOfDay: string;
    rampWeeks: number;
    rampDaysOfWeek: string[];
    startsOn: string;
    endsOn: string;
    mix: string[];
  };
}) {
  return (
    <form action={savePlan} className="space-y-4">
      <Field label="Post on these days">
        <DayPicker name="daysOfWeek" selected={plan.daysOfWeek} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="At" hint="Late afternoon catches people coming home.">
          <input type="time" name="timeOfDay" defaultValue={plan.timeOfDay} className="field" />
        </Field>
        <Field label="Step up for the last" hint="Weeks before voting day.">
          <input
            type="number"
            name="rampWeeks"
            min={0}
            max={8}
            defaultValue={plan.rampWeeks}
            className="field"
          />
        </Field>
      </div>

      <Field label="…posting on these days instead">
        <DayPicker name="rampDaysOfWeek" selected={plan.rampDaysOfWeek} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start">
          <input type="date" name="startsOn" defaultValue={plan.startsOn} className="field" />
        </Field>
        <Field label="Until">
          <input type="date" name="endsOn" defaultValue={plan.endsOn} className="field" />
        </Field>
      </div>

      <Field
        label="Draw from these kinds of post"
        hint="A feed that is all “vote for me” stops being read. The schedule rotates through whatever is ticked."
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {POST_KIND_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="mix"
                value={option.value}
                defaultChecked={plan.mix.includes(option.value)}
                className="size-4 rounded border-line"
              />
              {option.label}
            </label>
          ))}
        </div>
      </Field>

      <button type="submit" className="btn-primary w-full">
        Save the plan and lay out the schedule
      </button>
      <p className="text-xs text-muted">
        Slots you have already edited, approved or posted are left alone. Only
        untouched suggestions are rewritten.
      </p>
    </form>
  );
}
