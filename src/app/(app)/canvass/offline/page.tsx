"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SupportBadge, titleCase } from "@/components/voter";
import { ContactForm } from "@/components/contact-form";
import { DoorHanger, NobodyHome } from "@/components/door-actions";
import { whenSaved } from "@/components/turf-offline";
import { downloadTurf, listSnapshots, removeSnapshot, syncWalked } from "@/lib/offline-turf";
import { streetsOf, type SnapshotDoor, type TurfSnapshot } from "@/lib/turf-snapshot";

/**
 * A turf that was saved to this phone, walked with no signal.
 *
 * Rendered entirely on the device: the page holds no server data of its own, so
 * the service worker can keep it and it will open in a dead zone with nothing
 * but what is in IndexedDB. Every door on it logs through the same outbox as
 * the live list, which is what makes the trip home the moment everything
 * uploads rather than a data-entry evening.
 *
 * The age of the list is stated at the top and never hidden, because that is
 * the whole cost of walking from a snapshot.
 */
export default function OfflineWalkListPage() {
  const [turfs, setTurfs] = useState<TurfSnapshot[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listSnapshots().then((all) => {
      setTurfs(all);
      setOpenId((current) => current ?? (all.length === 1 ? all[0].turfId : null));
    });
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("offline-turfs:changed", reload);
    return () => window.removeEventListener("offline-turfs:changed", reload);
  }, [reload]);

  if (turfs === null) {
    return <p className="text-sm text-muted">Looking on this device...</p>;
  }

  const open = turfs.find((t) => t.turfId === openId) ?? null;

  return (
    <>
      <PageHeader
        title={open ? open.name : "Saved walk lists"}
        subtitle={
          open
            ? `Saved ${whenSaved(open.capturedAt)} · ${open.doors.length} doors`
            : "Turf you downloaded before heading out of coverage"
        }
        actions={
          <>
            {open && turfs.length > 1 ? (
              <button type="button" onClick={() => setOpenId(null)} className="btn-secondary">
                All saved turf
              </button>
            ) : null}
            <Link href="/canvass" className="btn-secondary">
              Live canvass
            </Link>
          </>
        }
      />

      {turfs.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing saved to this device"
            hint="Open a turf while you still have signal and choose Save this turf to my phone. It will then open here with no coverage at all."
            action={
              <Link href="/canvass" className="btn-primary">
                Pick a turf
              </Link>
            }
          />
        </Card>
      ) : open ? (
        <SavedTurf snapshot={open} />
      ) : (
        <div className="space-y-3">
          {turfs.map((turf) => (
            <Card key={turf.turfId}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{turf.name}</p>
                  <p className="text-sm text-muted">
                    {turf.doors.length} doors · saved {whenSaved(turf.capturedAt)}
                  </p>
                </div>
                <button type="button" onClick={() => setOpenId(turf.turfId)} className="btn-primary">
                  Open
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** One saved turf: its age, its progress, and its doors. */
function SavedTurf({ snapshot }: { snapshot: TurfSnapshot }) {
  const [walked, setWalked] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // The outbox is where every door in this app lands first, so watching it is
  // how the walk list knows what has been done without any form telling it.
  useEffect(() => {
    const sync = () => setWalked(syncWalked(snapshot));
    sync();
    window.addEventListener("outbox:changed", sync);
    return () => window.removeEventListener("outbox:changed", sync);
  }, [snapshot]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await downloadTurf(snapshot.turfId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "It could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  const done = new Set(walked);
  const streets = streetsOf(snapshot.doors);
  const knocked = snapshot.doors.filter((d) => d.knocked || done.has(d.id)).length;

  return (
    <>
      <div
        className={`mb-6 rounded-xl border p-4 text-sm ${
          online ? "border-line bg-surface" : "border-accent bg-accent-soft text-accent-ink"
        }`}
      >
        <p>
          <strong>This list is a copy, frozen {whenSaved(snapshot.capturedAt)}.</strong> Support
          levels and knocked marks are as they were then — anything logged since, by you or by
          anyone else, is not on it.
        </p>
        <p className="mt-1 text-xs">
          {online
            ? "You are back in coverage. Doors you logged are uploading on their own; refresh to pick up everyone else's work too."
            : "No signal. Keep knocking — every door you log is held on this phone and sent when coverage returns."}
        </p>
        {online ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="btn-secondary"
            >
              {refreshing ? "Refreshing..." : "Refresh from the server"}
            </button>
            <Link href={`/canvass/${snapshot.turfId}`} className="text-xs underline">
              Open the live turf instead
            </Link>
            <button
              type="button"
              onClick={() => void removeSnapshot(snapshot.turfId)}
              className="text-xs text-muted underline decoration-dotted hover:text-ink"
            >
              Remove from this device
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>

      <p className="mb-4 text-sm text-muted">
        {knocked} of {snapshot.doors.length} doors done
        {walked.length > 0 ? ` · ${walked.length} by you since you set off` : ""}
      </p>

      {snapshot.description ? (
        <div className="mb-6">
          <Card>
            <p className="text-sm">{snapshot.description}</p>
          </Card>
        </div>
      ) : null}

      <section className="space-y-6">
        {streets.map((street) => (
          <Card
            key={street.name}
            title={titleCase(street.name)}
            description={`${street.doors.length} doors`}
          >
            <ul className="divide-y divide-line">
              {street.doors.map((door) => (
                <SavedDoor
                  key={door.id}
                  door={door}
                  snapshot={snapshot}
                  doneHere={done.has(door.id)}
                />
              ))}
            </ul>
          </Card>
        ))}
      </section>
    </>
  );
}

function SavedDoor({
  door,
  snapshot,
  doneHere,
}: {
  door: SnapshotDoor;
  snapshot: TurfSnapshot;
  doneHere: boolean;
}) {
  return (
    <li className="py-3">
      <p className="font-semibold">
        {door.streetNumber}
        {door.unit ? ` — Unit ${door.unit}` : ""}{" "}
        <span className="font-normal text-muted">{titleCase(door.streetName)}</span>
        {doneHere ? (
          <Badge tone="good" className="ml-2">
            Done just now
          </Badge>
        ) : door.knocked ? (
          <Badge tone="neutral" className="ml-2">
            Knocked before
          </Badge>
        ) : null}
      </p>

      {door.voters.length === 0 ? (
        <p className="text-sm text-muted">Nobody on file at this address.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {door.voters.map((voter) => (
            <li key={voter.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  {titleCase(voter.firstName)} {titleCase(voter.lastName)}
                </span>
                <SupportBadge level={voter.supportLevel} />
                {voter.doNotContact ? <Badge tone="bad">Do not knock</Badge> : null}
                {voter.wantsSign ? <Badge tone="brand">Sign</Badge> : null}
              </div>

              {!voter.doNotContact ? (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-brand">
                    Log a contact
                  </summary>
                  <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
                    <ContactForm
                      voterId={voter.id}
                      volunteers={snapshot.volunteers}
                      draftScope={snapshot.campaignId}
                      defaultVolunteerId={snapshot.assignedToId}
                      knownPhone={voter.phone}
                      knownEmail={voter.email}
                      smsConsent={voter.smsConsent}
                      compact
                    />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <NobodyHome householdId={door.id} defaultVolunteerId={snapshot.assignedToId} />
        <DoorHanger householdId={door.id} defaultVolunteerId={snapshot.assignedToId} />
        <details>
          <summary className="cursor-pointer text-xs font-medium text-brand">
            {door.voters.length === 0 ? "Someone answered" : "Someone else lives here"}
          </summary>
          <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
            <ContactForm
              householdId={door.id}
              askForName
              volunteers={snapshot.volunteers}
              draftScope={snapshot.campaignId}
              defaultVolunteerId={snapshot.assignedToId}
              compact
            />
          </div>
        </details>
      </div>
    </li>
  );
}
