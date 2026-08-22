import { db } from "./db";
import { IMPRECISE_GEOCODES } from "./enums";
import { getActiveCampaign } from "./campaign";

/**
 * Builds every point the map draws. Shared by the page's first render and the
 * /api/map refresh endpoint so the two can never drift apart.
 */

export type MapDoor = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  street: string;
  voters: number;
  /** Rounded average of the support levels known at this address, 1–5. */
  support: number | null;
  visited: boolean;
  lastContact: string | null;
  imprecise: boolean;
  turfId: string | null;
};

export type MapRoute = {
  turfId: string;
  name: string;
  plannedFor: string | null;
  doors: number;
  /**
   * One line per street, each in civic-number order. Drawn per street rather
   * than as one path across the turf because a single line would leap from the
   * end of one street to the start of the next and read as nonsense.
   */
  segments: [number, number][][];
};

export type MapSign = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  status: string;
  signType: string;
  quantity: number;
  imprecise: boolean;
};

export type MapPayload = {
  doors: MapDoor[];
  routes: MapRoute[];
  signs: MapSign[];
  centre: [number, number] | null;
};

export async function getMapPayload(): Promise<MapPayload> {
  const campaign = await getActiveCampaign();
  if (!campaign) return { doors: [], routes: [], signs: [], centre: null };

  const campaignId = campaign.id;
  const municipalityId = campaign.municipalityId;

  const [households, signs, turfs] = await Promise.all([
    // Doors belong to the municipality and are shared; what this campaign knows
    // about the people behind them does not.
    db.household.findMany({
      where: { municipalityId, latitude: { not: null }, longitude: { not: null } },
      include: {
        voters: {
          select: {
            campaignStates: {
              where: { campaignId },
              select: { supportLevel: true },
            },
            contacts: {
              where: { campaignId },
              select: { occurredAt: true },
              orderBy: { occurredAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    db.signRequest.findMany({
      where: { campaignId, latitude: { not: null }, longitude: { not: null } },
    }),
    db.turf.findMany({
      where: { campaignId, status: { not: "COMPLETE" } },
      include: {
        households: {
          where: {
            household: { latitude: { not: null }, longitude: { not: null } },
          },
          select: {
            household: {
              select: {
                latitude: true,
                longitude: true,
                streetName: true,
                streetNumber: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const doors: MapDoor[] = households.map((h) => {
    const known = h.voters
      .map((v) => v.campaignStates[0]?.supportLevel ?? null)
      .filter((n): n is number => n !== null && n >= 1 && n <= 5);

    const contactTimes = h.voters
      .flatMap((v) => v.contacts.map((c) => c.occurredAt))
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      id: h.id,
      lat: h.latitude as number,
      lng: h.longitude as number,
      label: `${h.streetNumber} ${h.streetName}${h.unit ? ` Unit ${h.unit}` : ""}`.trim(),
      street: h.streetName,
      voters: h.voters.length,
      support:
        known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null,
      visited: contactTimes.length > 0,
      lastContact: contactTimes[0]?.toISOString() ?? null,
      imprecise: IMPRECISE_GEOCODES.includes(h.geocodePrecision),
      turfId: null,
    };
  });

  const routes: MapRoute[] = turfs
    .map((t) => {
      const members = t.households.map((th) => th.household);
      const byStreet = new Map<string, typeof members>();
      for (const h of members) {
        const list = byStreet.get(h.streetName);
        if (list) list.push(h);
        else byStreet.set(h.streetName, [h]);
      }

      const segments = Array.from(byStreet.values())
        .map((list) =>
          [...list]
            .sort(byWalkOrder)
            .map((h) => [h.latitude as number, h.longitude as number] as [number, number]),
        )
        // A single door is a point, not a line worth drawing.
        .filter((segment) => segment.length > 1);

      return {
        turfId: t.id,
        name: t.name,
        plannedFor: t.plannedFor?.toISOString() ?? null,
        doors: members.length,
        segments,
      };
    })
    .filter((r) => r.segments.length > 0);

  const mapSigns: MapSign[] = signs.map((s) => ({
    id: s.id,
    lat: s.latitude as number,
    lng: s.longitude as number,
    label: [s.requesterName, s.addressLine].filter(Boolean).join(" — "),
    status: s.status,
    signType: s.signType,
    quantity: s.quantity,
    imprecise: IMPRECISE_GEOCODES.includes(s.geocodePrecision),
  }));

  // Centre on the mean of everything placed, so the map opens over the
  // municipality rather than somewhere in the Atlantic.
  const all = [...doors, ...mapSigns];
  const centre: [number, number] | null =
    all.length > 0
      ? [
          all.reduce((n, p) => n + p.lat, 0) / all.length,
          all.reduce((n, p) => n + p.lng, 0) / all.length,
        ]
      : null;

  return { doors, routes, signs: mapSigns, centre };
}

function byWalkOrder(
  a: { streetName: string; streetNumber: string },
  b: { streetName: string; streetNumber: string },
): number {
  const street = a.streetName.localeCompare(b.streetName);
  if (street !== 0) return street;
  const na = parseInt(a.streetNumber, 10);
  const nb = parseInt(b.streetNumber, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) {
    return a.streetNumber.localeCompare(b.streetNumber);
  }
  return na - nb;
}
