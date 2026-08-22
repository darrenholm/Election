/**
 * Demo data for a consultant running several candidates at once.
 *
 * Modelled on the real shape of the problem: one municipality that elects at
 * large and one divided into wards, six candidates between them, and a shared
 * address file per municipality that every campaign in that town works from.
 *
 * Everything here is invented — the names are made up and any resemblance to
 * real candidates is coincidental. It exists so the app is worth looking at
 * before real data arrives, and so the compliance checks have something to
 * flag: the contributions below deliberately include an over-limit donor, a
 * cash gift above $25 and a contributor with no address, because a finance page
 * that is always green teaches you nothing.
 *
 * Run `npm run db:seed` to reload it.
 */

import { PrismaClient } from "@prisma/client";
import { DOOR_CONSENT_SCRIPT, normalisePhone } from "../src/lib/consent";
import { canonicalStreet } from "../src/lib/address";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

/* A tiny deterministic PRNG so every seed run produces the same campaign. */
let seed = 20261026;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function chance(p: number): boolean {
  return rand() < p;
}
function intBetween(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

const VOTING_DAY = new Date(2026, 9, 26); // fourth Monday of October 2026
const DAY = 86_400_000;
function daysBefore(days: number): Date {
  return new Date(VOTING_DAY.getTime() - days * DAY);
}

type TownSpec = {
  name: string;
  usesWards: boolean;
  centre: { lat: number; lng: number };
  streets: string[];
  postalPrefix: string;
  city: string;
};

const TOWNS: TownSpec[] = [
  {
    name: "Municipality of Brockton",
    usesWards: false,
    centre: { lat: 44.1288, lng: -81.1449 },
    city: "Walkerton",
    postalPrefix: "N0G",
    streets: [
      "YONGE ST S", "DURHAM ST E", "JACKSON ST", "COLBORNE ST S", "VICTORIA ST S",
      "THOMAS ST", "HINKS ST", "WESTWOOD DR", "OLD DURHAM RD", "ORANGE ST",
      "WILLOW ST", "VALLEYSIDE DR", "CONCESSION 6", "BRUCE ROAD 15", "LAKE ROSALIND RD 4",
    ],
  },
  {
    name: "Municipality of West Grey",
    usesWards: true,
    centre: { lat: 44.1836, lng: -80.8189 },
    city: "Durham",
    postalPrefix: "N0G",
    streets: [
      "GARAFRAXA ST S", "GEORGE ST W", "LAMBTON ST E", "COUNTESS ST",
      "SADDLER ST W", "ELGIN ST N", "QUEEN ST", "MILL ST",
      "CONCESSION 2 NDR", "GREY ROAD 4",
    ],
  },
];

/** Streets laid out as a grid over the town centre, so the map reads as a town. */
function doorCoordinates(town: TownSpec, streetIndex: number, doorIndex: number) {
  const eastWest = streetIndex % 2 === 0;
  const offset = (Math.floor(streetIndex / 2) - 3) * 0.0055;
  const baseLat = town.centre.lat + (eastWest ? offset : -0.008);
  const baseLng = town.centre.lng + (eastWest ? -0.011 : offset * 1.4);
  const along = doorIndex * 0.00042;
  const jitter = ((doorIndex % 3) - 1) * 0.00008;
  return eastWest
    ? { latitude: baseLat + jitter, longitude: baseLng + along }
    : { latitude: baseLat + along, longitude: baseLng + jitter };
}

const FIRST_NAMES = [
  "Margaret", "David", "Susan", "Robert", "Linda", "Michael", "Patricia", "James",
  "Barbara", "John", "Jennifer", "William", "Elizabeth", "Richard", "Nancy",
  "Joseph", "Karen", "Thomas", "Sandra", "Christopher", "Aisha", "Wei", "Priya",
  "Mateo", "Fatima", "Liam", "Chloe", "Noah", "Emma", "Owen", "Ava", "Lucas",
];

const LAST_NAMES = [
  "Thompson", "MacDonald", "Chen", "Patel", "Nguyen", "Brown", "Wilson", "Taylor",
  "Anderson", "Kowalski", "Okafor", "Silva", "Tremblay", "Murphy", "Singh",
  "Campbell", "Ferguson", "Doyle", "Beaulieu", "Ahmed", "Kaur", "Rossi", "Cormier",
];

const ISSUES = ["roads", "taxes", "development", "parks", "seniors", "water", "policing", "broadband"];

type CandidateSpec = {
  town: string;
  name: string;
  office: string;
  ward?: string;
  electors: number;
  /** How much of the file this campaign has worked through. */
  effort: number;
};

const CANDIDATES: CandidateSpec[] = [
  { town: "Municipality of West Grey", name: "Rebecca Hergert", office: "HEAD_OF_COUNCIL", ward: "", electors: 10400, effort: 0.62 },
  { town: "Municipality of Brockton", name: "Dana Whitfield", office: "HEAD_OF_COUNCIL", electors: 7900, effort: 0.55 },
  { town: "Municipality of Brockton", name: "Owen Kilbride", office: "COUNCILLOR", electors: 7900, effort: 0.41 },
  { town: "Municipality of Brockton", name: "Priya Raman", office: "COUNCILLOR", electors: 7900, effort: 0.33 },
  { town: "Municipality of Brockton", name: "Marcus Bell", office: "COUNCILLOR", electors: 7900, effort: 0.24 },
  { town: "Municipality of Brockton", name: "Helen Ostrander", office: "SCHOOL_TRUSTEE", electors: 7900, effort: 0.18 },
];

async function main() {
  console.log("Clearing existing data…");
  // Municipality and Campaign cascade to everything else.
  await db.user.deleteMany();
  await db.municipality.deleteMany();
  await db.campaign.deleteMany();

  const townIds = new Map<string, string>();
  const householdsByTown = new Map<string, { id: string; street: string }[]>();
  const votersByTown = new Map<string, string[]>();

  for (const town of TOWNS) {
    console.log(`${town.name}…`);
    const municipality = await db.municipality.create({
      data: { name: town.name, usesWards: town.usesWards },
    });
    townIds.set(town.name, municipality.id);

    const households: { id: string; street: string }[] = [];
    const voters: string[] = [];
    let externalId = 30000;

    for (const [streetIndex, street] of town.streets.entries()) {
      const doors = intBetween(12, 22);
      for (let d = 0; d < doors; d++) {
        const coords = doorCoordinates(town, streetIndex, d);
        const household = await db.household.create({
          data: {
            municipalityId: municipality.id,
            streetNumber: String(2 + d * 2 + intBetween(0, 1)),
            streetName: street,
            streetKey: canonicalStreet(street),
            city: town.city,
            postalCode: `${town.postalPrefix} ${intBetween(1, 9)}${pick(["A", "B", "C", "G", "H", "J"])}${intBetween(1, 9)}`,
            ward: town.usesWards ? `Ward ${intBetween(1, 4)}` : "",
            pollNumber: String(intBetween(1, 12)).padStart(3, "0"),
            latitude: coords.latitude,
            longitude: coords.longitude,
            geocodeStatus: "OK",
            // A handful land on the road rather than the driveway, so the map's
            // "rough location" flag has something real to show.
            geocodePrecision: d % 11 === 0 ? "GEOMETRIC_CENTER" : "ROOFTOP",
            geocodedAt: new Date(),
          },
        });
        households.push({ id: household.id, street });

        const lastName = pick(LAST_NAMES);
        const occupants = chance(0.45) ? 2 : chance(0.15) ? 3 : 1;
        for (let p = 0; p < occupants; p++) {
          const voter = await db.voter.create({
            data: {
              municipalityId: municipality.id,
              externalId: `${town.postalPrefix}-${externalId++}`,
              firstName: pick(FIRST_NAMES),
              lastName: chance(0.8) ? lastName : pick(LAST_NAMES),
              phone: chance(0.55) ? `519-555-${String(intBetween(1000, 9999))}` : "",
              email: chance(0.25) ? `resident${externalId}@example.com` : "",
              householdId: household.id,
              deceased: chance(0.01),
              movedAway: chance(0.02),
            },
          });
          voters.push(voter.id);
        }
      }
    }

    householdsByTown.set(town.name, households);
    votersByTown.set(town.name, voters);
    console.log(`  ${households.length} doors, ${voters.length} electors`);
  }

  for (const spec of CANDIDATES) {
    console.log(`${spec.name}…`);
    const municipalityId = townIds.get(spec.town)!;
    const town = TOWNS.find((t) => t.name === spec.town)!;

    const campaign = await db.campaign.create({
      data: {
        slug: spec.name.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + spec.office.toLowerCase().replace(/_/g, "-"),
        candidateName: spec.name,
        office: spec.office,
        municipalityId,
        ward: spec.ward ?? "",
        votingDay: VOTING_DAY,
        campaignPeriodStart: daysBefore(150),
        campaignPeriodEnd: new Date(2026, 11, 31),
        electorCount: spec.electors,
        contactEmail: `team@${spec.name.split(" ")[1].toLowerCase()}.example`,
        contactPhone: `519-555-0${intBetween(100, 199)}`,
        twilioFromNumber: `+1519555${intBetween(1000, 9999)}`,
      },
    });

    /* --- volunteers --- */
    const volunteerCount = spec.office === "HEAD_OF_COUNCIL" ? 8 : intBetween(3, 5);
    const volunteers = [];
    for (let i = 0; i < volunteerCount; i++) {
      volunteers.push(
        await db.volunteer.create({
          data: {
            campaignId: campaign.id,
            firstName: pick(FIRST_NAMES),
            lastName: pick(LAST_NAMES),
            email: `vol${i}@example.com`,
            phone: `519-555-0${200 + i}`,
            status: chance(0.85) ? "ACTIVE" : "PROSPECT",
            roles: pick(["CANVASSER", "CANVASSER,DRIVER", "PHONE_BANKER", "SIGN_CREW", "CANVASSER,DATA_ENTRY"]),
            availability: pick(["Weekday evenings", "Weekends", "Retired — any time", "Saturday mornings"]),
            hasVehicle: chance(0.6),
          },
        }),
      );
    }

    /* --- turf, cut this campaign's own way --- */
    const households = householdsByTown.get(spec.town)!;
    const streets = town.streets;
    const chunk = Math.ceil(streets.length / 3);
    for (let t = 0; t < 3; t++) {
      const turfStreets = streets.slice(t * chunk, (t + 1) * chunk);
      if (turfStreets.length === 0) continue;
      const turf = await db.turf.create({
        data: {
          campaignId: campaign.id,
          name: `${spec.name.split(" ")[1]} turf ${t + 1}`,
          description: "Two hours of doors. Skip anything marked do-not-contact.",
          status: t === 0 ? "IN_PROGRESS" : t === 1 ? "ASSIGNED" : "UNASSIGNED",
          assignedToId: t < volunteers.length ? volunteers[t].id : null,
          plannedFor: t < 2 ? new Date(Date.now() + (t * 6 + 3) * DAY) : null,
        },
      });
      const members = households.filter((h) => turfStreets.includes(h.street));
      if (members.length > 0) {
        await db.turfHousehold.createMany({
          data: members.map((h) => ({ turfId: turf.id, householdId: h.id })),
        });
      }
    }

    /* --- what this campaign knows about the electors --- */
    const voters = votersByTown.get(spec.town)!;
    const worked = voters.filter(() => chance(spec.effort));
    let identified = 0;
    let consented = 0;

    for (const voterId of worked) {
      const supportLevel = pick([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
      const wantsSign = supportLevel === 1 && chance(0.3);
      const askedAboutTexts = chance(0.45);
      const agreed = askedAboutTexts && chance(0.6);

      await db.voterCampaignState.create({
        data: {
          campaignId: campaign.id,
          voterId,
          supportLevel,
          wantsSign,
          wantsToVolunteer: supportLevel === 1 && chance(0.1),
          isDonorProspect: supportLevel <= 2 && chance(0.15),
          doNotContact: chance(0.03),
          tags: chance(0.3) ? pick(ISSUES) : "",
          ...(askedAboutTexts
            ? {
                smsConsent: agreed ? "GRANTED" : "DECLINED",
                smsConsentAt: new Date(Date.now() - intBetween(1, 60) * DAY),
                smsConsentSource: "DOOR",
                smsConsentWording: DOOR_CONSENT_SCRIPT,
              }
            : {}),
        },
      });
      identified++;
      if (agreed) consented++;

      await db.contactAttempt.create({
        data: {
          campaignId: campaign.id,
          voterId,
          volunteerId: pick(volunteers).id,
          method: chance(0.75) ? "DOOR" : "PHONE",
          result: "SPOKE",
          supportLevel,
          issues: chance(0.4) ? pick(ISSUES) : "",
          notes: chance(0.2)
            ? pick([
                "Wants to talk about the road reconstruction.",
                "Concerned about the tax increase; asked for the platform.",
                "Long-time supporter, offered to hand out flyers.",
                "Asked whether the arena decision is settled.",
              ])
            : "",
          occurredAt: new Date(Date.now() - intBetween(1, 60) * DAY),
        },
      });

      if (wantsSign) {
        const voter = await db.voter.findUnique({
          where: { id: voterId },
          include: { household: true },
        });
        if (voter?.household) {
          await db.signRequest.create({
            data: {
              campaignId: campaign.id,
              voterId,
              requesterName: `${voter.firstName} ${voter.lastName}`.trim(),
              phone: voter.phone,
              addressLine: `${voter.household.streetNumber} ${voter.household.streetName}`,
              city: voter.household.city,
              postalCode: voter.household.postalCode,
              ward: voter.household.ward,
              latitude: voter.household.latitude,
              longitude: voter.household.longitude,
              geocodeStatus: "OK",
              geocodePrecision: "ROOFTOP",
              geocodedAt: new Date(),
              status: pick(["INSTALLED", "INSTALLED", "SCHEDULED", "APPROVED", "REQUESTED"]),
              permissionConfirmed: chance(0.8),
              requestedAt: daysBefore(intBetween(30, 90)),
              installedAt: chance(0.5) ? daysBefore(intBetween(10, 60)) : null,
            },
          });
        }
      }
    }

    await db.signInventory.createMany({
      data: [
        { campaignId: campaign.id, signType: "SMALL_LAWN", quantityOwned: spec.office === "HEAD_OF_COUNCIL" ? 400 : 200 },
        { campaignId: campaign.id, signType: "LARGE_LAWN", quantityOwned: 40 },
        { campaignId: campaign.id, signType: "BIG_4X8", quantityOwned: 4 },
      ],
    });

    /* --- shifts --- */
    for (const [i, title] of ["Saturday canvass", "Evening phone bank", "Sign install run"].entries()) {
      const startsAt = new Date();
      startsAt.setDate(startsAt.getDate() + 3 + i * 3);
      startsAt.setHours(10 + i * 2, 0, 0, 0);
      const shift = await db.shift.create({
        data: {
          campaignId: campaign.id,
          title: `${title} — ${spec.name.split(" ")[1]}`,
          type: i === 1 ? "PHONE_BANK" : i === 2 ? "SIGN_INSTALL" : "CANVASS",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 2.5 * 3_600_000),
          location: "Campaign office",
          capacity: 4,
          notes: "Clipboards, walk lists and water provided.",
        },
      });
      for (const volunteer of volunteers.slice(0, intBetween(1, 3))) {
        await db.shiftAssignment.create({
          data: {
            shiftId: shift.id,
            volunteerId: volunteer.id,
            status: chance(0.5) ? "CONFIRMED" : "SIGNED_UP",
          },
        });
      }
    }

    /* --- events --- */
    const fundraiser = await db.event.create({
      data: {
        campaignId: campaign.id,
        name: `${spec.name.split(" ")[1]} campaign launch`,
        type: "FUNDRAISER",
        startsAt: new Date(daysBefore(120).getTime() + 17 * 3_600_000),
        location: "Legion hall",
        isFundraiser: true,
        ticketPriceCents: 5000,
        expectedAttendance: 60,
        actualAttendance: intBetween(40, 90),
      },
    });
    await db.event.create({
      data: {
        campaignId: campaign.id,
        name: "All-candidates meeting",
        type: "ALL_CANDIDATES",
        startsAt: new Date(daysBefore(21).getTime() + 19 * 3_600_000),
        location: "Community centre",
        expectedAttendance: 120,
      },
    });

    /* --- money, with deliberate compliance problems on the lead campaign --- */
    const isLead = spec.name === "Rebecca Hergert";
    const donors: { first: string; last: string; address: string; amounts: number[]; cash?: boolean; candidate?: boolean; spouse?: boolean }[] = [
      { first: spec.name.split(" ")[0], last: spec.name.split(" ")[1], address: "44 Main St", amounts: [300000], candidate: true },
      { first: "Eleanor", last: "Whitfield", address: "18 Bond St W", amounts: isLead ? [50000, 50000, 40000] : [40000] },
      { first: "Raj", last: "Balakrishnan", address: "212 Elgin St N", amounts: [80000] },
      { first: "Denise", last: "Corbeil", address: "7 Peel St", amounts: [25000] },
      { first: "Colin", last: "Hargreaves", address: "", amounts: isLead ? [45000] : [15000] },
      { first: "Gordon", last: "Leask", address: "4 Adelaide St N", amounts: [3000], cash: isLead },
    ];

    let receipt = 1;
    for (const donor of donors) {
      const contributor = await db.contributor.create({
        data: {
          campaignId: campaign.id,
          firstName: donor.first,
          lastName: donor.last,
          addressLine: donor.address,
          city: donor.address ? town.city : "",
          postalCode: donor.address ? `${town.postalPrefix} 2A1` : "",
          isCandidate: donor.candidate ?? false,
          isCandidateSpouse: donor.spouse ?? false,
        },
      });
      for (const amountCents of donor.amounts) {
        await db.contribution.create({
          data: {
            campaignId: campaign.id,
            contributorId: contributor.id,
            amountCents,
            receivedAt: daysBefore(intBetween(20, 130)),
            method: donor.cash ? "CASH" : pick(["CHEQUE", "ETRANSFER", "CREDIT_CARD"]),
            receiptNumber: `R-${String(receipt++).padStart(4, "0")}`,
            receiptIssuedAt: daysBefore(intBetween(20, 130)),
            eventId: chance(0.3) ? fundraiser.id : null,
          },
        });
      }
    }

    const expenses: { desc: string; category: string; cents: number; days: number }[] = [
      { desc: "Nomination filing fee", category: "NOMINATION_FEE", cents: 10000, days: 150 },
      { desc: "Lawn signs", category: "SIGNS", cents: spec.office === "HEAD_OF_COUNCIL" ? 187500 : 96000, days: 110 },
      { desc: "Brochures", category: "BROCHURES", cents: 62000, days: 60 },
      { desc: "Newspaper advertising", category: "ADVERTISING", cents: 45000, days: 40 },
      { desc: "Campaign launch — hall and food", category: "FUNDRAISING_COSTS", cents: 88000, days: 120 },
      { desc: "Financial statement preparation", category: "ACCOUNTING_AUDIT", cents: 90000, days: 5 },
      { desc: "Volunteer thank-you", category: "APPRECIATION_PARTY", cents: 48000, days: -7 },
    ];
    for (const e of expenses) {
      const subject = !["NOMINATION_FEE", "FUNDRAISING_COSTS", "ACCOUNTING_AUDIT", "APPRECIATION_PARTY"].includes(e.category);
      await db.expense.create({
        data: {
          campaignId: campaign.id,
          description: e.desc,
          category: e.category,
          amountCents: e.cents,
          incurredAt: daysBefore(e.days),
          paidAt: e.days > 0 ? daysBefore(e.days - 2) : null,
          subjectToLimit: subject,
          isPartyExpense: e.category === "APPRECIATION_PARTY",
          eventId: e.category === "FUNDRAISING_COSTS" ? fundraiser.id : null,
        },
      });
    }

    /* --- one opt-out, so the block list is not empty --- */
    const consentedVoter = await db.voterCampaignState.findFirst({
      where: { campaignId: campaign.id, smsConsent: "GRANTED", voter: { NOT: { phone: "" } } },
      include: { voter: true },
    });
    if (consentedVoter) {
      const e164 = normalisePhone(consentedVoter.voter.phone);
      if (e164) {
        await db.smsOptOut.create({
          data: { campaignId: campaign.id, phone: e164, reason: 'Texted "STOP"' },
        });
        await db.voterCampaignState.update({
          where: { id: consentedVoter.id },
          data: { smsConsent: "REVOKED" },
        });
      }
    }

    console.log(`  ${identified} identified, ${consented} agreed to texts`);
  }

  /* --- accounts: one administrator, one per candidate ------------------- */
  console.log("Accounts…");
  const demoPassword = await hashPassword("demo-password-1234");

  await db.user.create({
    data: {
      email: "admin@example.com",
      name: "Campaign consultant",
      passwordHash: demoPassword,
      isAdmin: true,
    },
  });

  // Each candidate reaches their own campaign and nothing else — which is the
  // point of the demo as much as anything else in it.
  for (const campaign of await db.campaign.findMany()) {
    const handle = campaign.candidateName.toLowerCase().replace(/[^a-z]+/g, ".");
    const user = await db.user.create({
      data: {
        email: `${handle}@example.com`,
        name: campaign.candidateName,
        passwordHash: demoPassword,
      },
    });
    await db.campaignAccess.create({
      data: { userId: user.id, campaignId: campaign.id, role: "OWNER" },
    });
  }

  console.log("\nDone:", {
    municipalities: await db.municipality.count(),
    campaigns: await db.campaign.count(),
    households: await db.household.count(),
    voters: await db.voter.count(),
    voterStates: await db.voterCampaignState.count(),
    contacts: await db.contactAttempt.count(),
    volunteers: await db.volunteer.count(),
    signs: await db.signRequest.count(),
    contributions: await db.contribution.count(),
    accounts: await db.user.count(),
  });
  console.log(
    "\nDemo sign-in: admin@example.com / demo-password-1234 (each candidate has their own account too)",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
