import { db } from "@/lib/db";
import { requireOwned } from "@/lib/guard";
import { stateOf } from "@/lib/voter-state";
import { SNAPSHOT_VERSION, type TurfSnapshot } from "@/lib/turf-snapshot";

export const dynamic = "force-dynamic";

/**
 * Hand a phone one turf, whole, to be walked with no signal.
 *
 * An API route rather than a server action because the caller is saving the
 * result to the device and needs to know whether it actually arrived — the
 * whole point is that it is taken deliberately, while the signal is still good.
 *
 * Only what a canvasser reads at a door is included. Notes, contact history and
 * everything else stay on the server, because a lost phone should carry the
 * smallest useful amount of the town's voters' list.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaignId = await requireOwned("turf", id);
  if (!campaignId) return Response.json({ error: "Not found" }, { status: 404 });

  const turf = await db.turf.findFirst({
    where: { id, campaignId },
    include: {
      households: {
        include: {
          household: {
            include: {
              contacts: { where: { campaignId }, select: { id: true }, take: 1 },
              voters: {
                include: {
                  campaignStates: { where: { campaignId } },
                  contacts: {
                    where: { campaignId },
                    orderBy: { occurredAt: "desc" },
                    select: { occurredAt: true },
                    take: 1,
                  },
                },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
              },
            },
          },
        },
      },
    },
  });
  if (!turf) return Response.json({ error: "Not found" }, { status: 404 });

  const volunteers = await db.volunteer.findMany({
    where: { campaignId, status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  const snapshot: TurfSnapshot = {
    version: SNAPSHOT_VERSION,
    turfId: turf.id,
    campaignId,
    name: turf.name,
    description: turf.description,
    assignedToId: turf.assignedToId,
    volunteers,
    capturedAt: new Date().toISOString(),
    doors: turf.households.map(({ household }) => ({
      id: household.id,
      streetNumber: household.streetNumber,
      streetName: household.streetName,
      unit: household.unit,
      knocked:
        household.contacts.length > 0 || household.voters.some((v) => v.contacts.length > 0),
      voters: household.voters.map((voter) => {
        const state = stateOf(voter.campaignStates[0]);
        return {
          id: voter.id,
          firstName: voter.firstName,
          lastName: voter.lastName,
          phone: voter.phone,
          email: voter.email,
          supportLevel: state.supportLevel,
          doNotContact: state.doNotContact,
          wantsSign: state.wantsSign,
          smsConsent: state.smsConsent,
          lastContactAt: voter.contacts[0]?.occurredAt.toISOString() ?? null,
        };
      }),
    })),
  };

  // Never let a proxy or the browser keep this: a snapshot's whole meaning is
  // the moment it was taken, and a cached one would lie about it.
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
