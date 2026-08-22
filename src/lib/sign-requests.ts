import { db } from "./db";

/**
 * Raise a sign request for a voter who asked for one, unless they already have
 * a live one. Shared by the canvass API and the server action so a sign
 * promised at the door reaches the sign crew the same way whichever route the
 * contact came in through.
 */
export async function createSignRequestForVoter(voterId: string): Promise<void> {
  const existing = await db.signRequest.findFirst({
    where: { voterId, status: { notIn: ["REMOVED", "DECLINED"] } },
    select: { id: true },
  });
  if (existing) return;

  const voter = await db.voter.findUnique({
    where: { id: voterId },
    include: { household: true },
  });
  if (!voter) return;

  await db.signRequest.create({
    data: {
      voterId,
      requesterName: `${voter.firstName} ${voter.lastName}`.trim(),
      phone: voter.phone,
      email: voter.email,
      addressLine: voter.household
        ? `${voter.household.streetNumber} ${voter.household.streetName}${
            voter.household.unit ? ` Unit ${voter.household.unit}` : ""
          }`.trim()
        : "",
      city: voter.household?.city ?? "",
      postalCode: voter.household?.postalCode ?? "",
      ward: voter.household?.ward ?? "",
      // The sign sits on the lawn of the house that asked for it, so it starts
      // from the household's coordinates rather than waiting to be geocoded.
      latitude: voter.household?.latitude ?? null,
      longitude: voter.household?.longitude ?? null,
      geocodeStatus: voter.household?.latitude != null ? "OK" : "PENDING",
      geocodePrecision: voter.household?.latitude != null ? voter.household.geocodePrecision : "",
      geocodedAt: voter.household?.latitude != null ? new Date() : null,
      notes: "Requested at the door.",
    },
  });
}
