"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SIGN_PLACEMENT_OPTIONS,
  SIGN_TYPE_OPTIONS,
  type SignPlacement,
} from "@/lib/enums";
import { PLACEMENT_CAUTIONS, removalWindowLabel } from "@/lib/sign-placement";
import { preparePhoto } from "@/lib/photo";
import { Card, Check, Field, Note, Select } from "@/components/ui";
import { createRoadsideSign } from "@/app/actions/signs";

type Volunteer = { id: string; firstName: string; lastName: string };

/**
 * Recording a sign at the side of the road, from a phone, standing next to it.
 *
 * The order of the fields is the order the job actually happens in: you have
 * already chosen the spot, so the first question is what kind of ground you are
 * standing on — and the answer changes the warnings shown and how long you will
 * have to come back for it. Coordinates are taken from the device rather than
 * typed, because nobody types a decimal degree correctly on a shoulder in
 * November.
 */
export function RoadsideForm({
  volunteers,
  defaultPlacement = "MUNICIPAL_ROW",
}: {
  volunteers: Volunteer[];
  defaultPlacement?: SignPlacement;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [placement, setPlacement] = useState<SignPlacement>(defaultPlacement);
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; blob: Blob; width: number; height: number } | null>(null);
  const [message, setMessage] = useState("");

  function locate() {
    if (!("geolocation" in navigator)) {
      setLocateError("This device cannot report its position. Type the landmark instead.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocating(false);
      },
      (error) => {
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was refused. Allow it in the browser settings, or describe the spot in the landmark field."
            : "Could not get a fix. Try again once you are out of the truck.",
        );
        setLocating(false);
      },
      // A roadside pin is worth waiting a few seconds for; a cached fix from
      // the last town over is worse than none.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
    } catch {
      setMessage("Could not read that photo. The sign will still be recorded without it.");
    }
  }

  function onSubmit(formData: FormData) {
    if (coords) {
      formData.set("latitude", String(coords.lat));
      formData.set("longitude", String(coords.lon));
    }

    startTransition(async () => {
      const signId = await createRoadsideSign(formData);

      if (signId && photo) {
        const body = new FormData();
        body.set("clientId", crypto.randomUUID());
        body.set("signRequestId", signId);
        body.set("width", String(photo.width));
        body.set("height", String(photo.height));
        if (coords) {
          body.set("latitude", String(coords.lat));
          body.set("longitude", String(coords.lon));
        }
        body.set("photo", photo.blob, "sign.jpg");
        try {
          await fetch("/api/sign-photos", { method: "POST", body });
        } catch {
          // The sign is recorded either way. A photo that could not be sent is
          // not worth losing the placement over.
          setMessage("Sign recorded. The photo did not send — no signal.");
        }
      }

      setCoords(null);
      setPhoto(null);
      setMessage((prior) => prior || "Sign recorded. Ready for the next one.");
      router.refresh();
    });
  }

  const cautions = PLACEMENT_CAUTIONS[placement];

  return (
    <Card
      title="Record a sign"
      description="Fill this in standing at the sign, before you drive away."
    >
      <form action={onSubmit} className="space-y-4">
        {/* Controlled rather than the shared <Select>, because the cautions and
            the deadline below have to change as soon as this does. It still
            carries a name, so it posts with the rest of the form. */}
        <Field label="Where is it standing?">
          <select
            name="placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value as SignPlacement)}
            className="field text-base"
          >
            {SIGN_PLACEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Note tone={placement === "MTO_HIGHWAY" || placement === "OTHER_PUBLIC" ? "warn" : "info"}>
          <p className="mb-1 font-semibold">
            Comes down within {removalWindowLabel(placement)}.
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {cautions.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        </Note>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sign type">
            <Select name="signType" options={SIGN_TYPE_OPTIONS} defaultValue="BIG_4X8" />
          </Field>
          <Field label="How many" hint="Signs in this one spot.">
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              inputMode="numeric"
              className="field"
            />
          </Field>
        </div>

        <Field
          label="Sign number"
          hint="The number on the back, so this one can be reconciled when it comes back in."
        >
          <input name="signNumber" className="field" inputMode="numeric" autoComplete="off" />
        </Field>

        <Field
          label="Landmark"
          hint="How the retrieval crew will find it in the dark — road, direction of travel, nearest crossroad, which corner."
        >
          <input
            name="landmark"
            required
            placeholder="Hwy 6 southbound at Concession 4, NE corner"
            className="field"
          />
        </Field>

        {/* --------------------------------------------------------- position */}
        <div className="rounded-lg border border-line bg-raise px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Position</p>
              <p className="text-xs text-muted">
                {coords
                  ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)} · ±${coords.accuracy} m`
                  : "Not taken yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="btn-secondary shrink-0"
            >
              {locating ? "Locating…" : coords ? "Retake" : "Use my location"}
            </button>
          </div>
          {locateError ? (
            <p className="mt-2 text-xs text-accent-ink">{locateError}</p>
          ) : null}
          {coords && coords.accuracy > 50 ? (
            <p className="mt-2 text-xs text-accent-ink">
              That fix is only good to ±{coords.accuracy} m. Make the landmark a good one.
            </p>
          ) : null}
        </div>

        {/* ----------------------------------------------------------- photo */}
        <div className="rounded-lg border border-line bg-raise px-3 py-3">
          <p className="text-sm font-semibold">Photo</p>
          <p className="mb-2 text-xs text-muted">
            Shows the crew what to look for, and shows a by-law officer the sign was
            placed properly.
          </p>
          {photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.dataUrl}
              alt="The sign where it stands"
              className="mb-2 max-h-40 rounded-lg border border-line object-cover"
            />
          ) : null}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            className="block w-full text-sm"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Permission from" hint="Landowner or business, where one gave it.">
            <input name="permissionFrom" className="field" autoComplete="off" />
          </Field>
          <Field label="Their phone">
            <input name="permissionPhone" type="tel" className="field" autoComplete="off" />
          </Field>
        </div>

        <Check name="permissionConfirmed" label="Permission confirmed" />

        {volunteers.length > 0 ? (
          <Field label="Placed by">
            <Select
              name="installedById"
              options={volunteers.map((v) => ({
                value: v.id,
                label: `${v.firstName} ${v.lastName}`.trim(),
              }))}
              includeBlank
              blankLabel="—"
            />
          </Field>
        ) : null}

        <Field label="Notes">
          <textarea name="notes" rows={2} className="field" />
        </Field>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Record this sign"}
          </button>
          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </div>
      </form>
    </Card>
  );
}
