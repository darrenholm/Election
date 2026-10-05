/**
 * A turf, frozen at a moment in time so it can be walked with no signal.
 *
 * The app's standing rule is that walk lists are never cached behind the
 * canvasser's back: a stale support level knocked from in good faith does real
 * damage. A snapshot is the deliberate exception — asked for by name before
 * heading out to a township with no bars, carrying the moment it was taken so
 * every screen it feeds can say how old it is.
 *
 * Kept small and flat on purpose. It is written to a phone that may be full,
 * and read by a page that must render before anything else has loaded.
 */

/** The current version of the shape below; a phone holding an older one refetches. */
export const SNAPSHOT_VERSION = 1;

export type SnapshotVoter = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  supportLevel: number | null;
  doNotContact: boolean;
  wantsSign: boolean;
  smsConsent: string;
  /** ISO date of the last contact this campaign logged, or null. */
  lastContactAt: string | null;
};

export type SnapshotDoor = {
  id: string;
  streetNumber: string;
  streetName: string;
  unit: string;
  /** Already knocked when the snapshot was taken. */
  knocked: boolean;
  voters: SnapshotVoter[];
};

export type SnapshotVolunteer = { id: string; firstName: string; lastName: string };

export type TurfSnapshot = {
  version: number;
  turfId: string;
  campaignId: string;
  name: string;
  description: string;
  assignedToId: string | null;
  volunteers: SnapshotVolunteer[];
  /** When the server built this, in ISO. Shown on every page that uses it. */
  capturedAt: string;
  doors: SnapshotDoor[];
};

/** Doors grouped into streets in walk order, shared by the live and saved lists. */
export function streetsOf(doors: SnapshotDoor[]): { name: string; doors: SnapshotDoor[] }[] {
  const byStreet = new Map<string, SnapshotDoor[]>();
  for (const door of doors) {
    const list = byStreet.get(door.streetName);
    if (list) list.push(door);
    else byStreet.set(door.streetName, [door]);
  }

  return Array.from(byStreet.entries())
    .map(([name, list]) => ({ name, doors: list.sort(byCivicNumber) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function byCivicNumber(a: SnapshotDoor, b: SnapshotDoor): number {
  const na = parseInt(a.streetNumber, 10);
  const nb = parseInt(b.streetNumber, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) {
    return a.streetNumber.localeCompare(b.streetNumber);
  }
  if (na !== nb) return na - nb;
  return (
    a.streetNumber.localeCompare(b.streetNumber) ||
    a.unit.localeCompare(b.unit, undefined, { numeric: true })
  );
}
