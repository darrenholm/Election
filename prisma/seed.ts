/**
 * Demo data for a fictional Ontario municipal campaign.
 *
 * Everything here is invented. It exists so the app is worth looking at before
 * a real voters' list is imported, and so the compliance checks have something
 * to flag: the contributions below deliberately include an over-limit donor, a
 * cash gift above $25 and a contributor with no address, because a finance
 * page that is always green teaches you nothing about what it will do when it
 * is not.
 *
 * Run `npm run db:reset` to wipe and reload it.
 */

import { PrismaClient } from "@prisma/client";

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

const STREETS = [
  "KENT ST W",
  "WILLIAM ST N",
  "LINDSAY ST S",
  "COLBORNE ST E",
  "ANGELINE ST N",
  "RUSSELL ST W",
  "DURHAM ST E",
  "GLENELG ST W",
  "SUSSEX ST N",
  "CAMBRIDGE ST S",
  "ORCHARD PARK RD",
  "MARY ST W",
  "ADELAIDE ST N",
  "PEEL ST",
  "BOND ST W",
];

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

const ISSUES = [
  "roads", "transit", "taxes", "development", "parks", "seniors", "water", "policing",
];

async function main() {
  console.log("Clearing existing data…");
  // Order matters: children before parents.
  await db.contactAttempt.deleteMany();
  await db.shiftAssignment.deleteMany();
  await db.shift.deleteMany();
  await db.signRequest.deleteMany();
  await db.signInventory.deleteMany();
  await db.contribution.deleteMany();
  await db.expense.deleteMany();
  await db.contributor.deleteMany();
  await db.event.deleteMany();
  await db.voter.deleteMany();
  await db.household.deleteMany();
  await db.turf.deleteMany();
  await db.volunteer.deleteMany();
  await db.campaign.deleteMany();

  console.log("Campaign…");
  await db.campaign.create({
    data: {
      id: "campaign",
      candidateName: "Jordan Reyes",
      office: "COUNCILLOR",
      municipality: "City of Kawartha Lakes",
      // The demo municipality has wards; many do not, and the app hides every
      // ward field when this is false. See Settings.
      usesWards: true,
      ward: "Ward 3",
      votingDay: VOTING_DAY,
      campaignPeriodStart: daysBefore(150),
      campaignPeriodEnd: new Date(2026, 11, 31),
      electorCount: 8200,
      contactEmail: "team@jordanreyes.example",
      contactPhone: "705-555-0142",
    },
  });

  console.log("Volunteers…");
  const volunteerSpecs = [
    { firstName: "Elena", lastName: "Vasquez", roles: "CANVASSER,PHONE_BANKER,DATA_ENTRY", hasVehicle: true, availability: "Weekday evenings, all day Saturday" },
    { firstName: "Marcus", lastName: "Bell", roles: "SIGN_CREW,DRIVER", hasVehicle: true, availability: "Weekends, has a pickup truck" },
    { firstName: "Priya", lastName: "Raman", roles: "CANVASSER,SOCIAL_MEDIA", hasVehicle: false, availability: "Evenings after 6" },
    { firstName: "Doug", lastName: "Fraser", roles: "CANVASSER,SCRUTINEER", hasVehicle: true, availability: "Retired — any time" },
    { firstName: "Hannah", lastName: "Oyelaran", roles: "FUNDRAISING,EVENT_HELP", hasVehicle: false, availability: "Weekends" },
    { firstName: "Tom", lastName: "Petrov", roles: "PHONE_BANKER,LIT_DROP", hasVehicle: false, availability: "Weekday afternoons" },
    { firstName: "Grace", lastName: "Lam", roles: "DATA_ENTRY,CANVASSER", hasVehicle: true, availability: "Tuesday and Thursday evenings" },
    { firstName: "Bill", lastName: "Hutchins", roles: "SIGN_CREW", hasVehicle: true, status: "PROSPECT", availability: "Not sure yet" },
  ];

  const volunteers: { id: string; roles: string }[] = [];
  for (const [i, spec] of volunteerSpecs.entries()) {
    volunteers.push(
      await db.volunteer.create({
        data: {
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: `${spec.firstName.toLowerCase()}@example.com`,
          phone: `705-555-0${100 + i}`,
          status: spec.status ?? "ACTIVE",
          roles: spec.roles,
          availability: spec.availability,
          hasVehicle: spec.hasVehicle,
        },
      }),
    );
  }

  console.log("Turf…");
  const turfSpecs = [
    { name: "Ward 3 — downtown core", streets: STREETS.slice(0, 5), assignee: 0, status: "IN_PROGRESS" },
    { name: "Ward 3 — north of Colborne", streets: STREETS.slice(5, 10), assignee: 2, status: "ASSIGNED" },
    { name: "Ward 3 — west end", streets: STREETS.slice(10), assignee: null, status: "UNASSIGNED" },
  ];
  const turfs: { id: string }[] = [];
  for (const spec of turfSpecs) {
    turfs.push(
      await db.turf.create({
        data: {
          name: spec.name,
          description: "Two hours of doors. Skip anything marked do-not-contact.",
          ward: "Ward 3",
          status: spec.status,
          assignedToId: spec.assignee === null ? null : volunteers[spec.assignee].id,
        },
      }),
    );
  }
  const turfForStreet = new Map<string, string>();
  turfSpecs.forEach((spec, i) => {
    for (const street of spec.streets) turfForStreet.set(street, turfs[i].id);
  });

  console.log("Households and voters…");
  const voterIds: string[] = [];
  let externalId = 30000;

  for (const street of STREETS) {
    const doors = intBetween(12, 22);
    for (let d = 0; d < doors; d++) {
      const streetNumber = String(2 + d * 2 + intBetween(0, 1));
      const household = await db.household.create({
        data: {
          streetNumber,
          streetName: street,
          city: "Lindsay",
          postalCode: `K9V ${intBetween(1, 9)}${pick(["A", "B", "C", "G", "H", "J"])}${intBetween(1, 9)}`,
          ward: "Ward 3",
          pollNumber: String(intBetween(1, 12)).padStart(3, "0"),
          turfId: turfForStreet.get(street) ?? null,
        },
      });

      const lastName = pick(LAST_NAMES);
      const occupants = chance(0.45) ? 2 : chance(0.15) ? 3 : 1;

      for (let p = 0; p < occupants; p++) {
        // About 55% of the file has been identified — a realistic mid-campaign
        // position for a ward race.
        const identified = chance(0.55);
        const supportLevel = identified
          ? pick([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5])
          : null;

        const voter = await db.voter.create({
          data: {
            externalId: `KL-${externalId++}`,
            firstName: pick(FIRST_NAMES),
            lastName: chance(0.8) ? lastName : pick(LAST_NAMES),
            phone: chance(0.55) ? `705-555-${String(intBetween(1000, 9999))}` : "",
            email: chance(0.25) ? `resident${externalId}@example.com` : "",
            householdId: household.id,
            supportLevel,
            wantsSign: supportLevel === 1 && chance(0.35),
            wantsToVolunteer: supportLevel === 1 && chance(0.12),
            isDonorProspect: supportLevel !== null && supportLevel <= 2 && chance(0.15),
            doNotContact: chance(0.03),
            tags: chance(0.3) ? pick(ISSUES) : "",
          },
        });
        voterIds.push(voter.id);

        if (identified) {
          const canvasser = pick(volunteers.slice(0, 5));
          const daysAgo = intBetween(1, 60);
          await db.contactAttempt.create({
            data: {
              voterId: voter.id,
              volunteerId: canvasser.id,
              method: chance(0.75) ? "DOOR" : "PHONE",
              result: "SPOKE",
              supportLevel,
              issues: chance(0.4) ? pick(ISSUES) : "",
              notes: chance(0.25)
                ? pick([
                    "Wants to talk about the Kent Street reconstruction.",
                    "Concerned about the tax increase; asked for the platform.",
                    "Long-time supporter, offered to hand out flyers.",
                    "Asked whether the arena decision is settled.",
                  ])
                : "",
              occurredAt: new Date(Date.now() - daysAgo * DAY),
            },
          });
        } else if (chance(0.2)) {
          await db.contactAttempt.create({
            data: {
              voterId: voter.id,
              volunteerId: pick(volunteers.slice(0, 5)).id,
              method: "DOOR",
              result: pick(["NOT_HOME", "NOT_HOME", "LEFT_LITERATURE", "REFUSED"]),
              occurredAt: new Date(Date.now() - intBetween(1, 45) * DAY),
            },
          });
        }
      }
    }
  }
  console.log(`  ${voterIds.length} voters`);

  console.log("Events…");
  const kickoff = await db.event.create({
    data: {
      name: "Campaign kickoff barbecue",
      type: "FUNDRAISER",
      startsAt: new Date(daysBefore(120).getTime() + 17 * 3_600_000),
      endsAt: new Date(daysBefore(120).getTime() + 20 * 3_600_000),
      location: "Lindsay Legion, Branch 67",
      addressLine: "9 York St S, Lindsay",
      description: "Ticketed barbecue to launch the campaign.",
      isFundraiser: true,
      ticketPriceCents: 5000,
      expectedAttendance: 80,
      actualAttendance: 94,
    },
  });

  await db.event.create({
    data: {
      name: "Ward 3 all-candidates meeting",
      type: "ALL_CANDIDATES",
      startsAt: new Date(daysBefore(21).getTime() + 19 * 3_600_000),
      location: "Lindsay Public Library",
      addressLine: "190 Kent St W, Lindsay",
      description: "Hosted by the ratepayers' association. Two-minute openings.",
      expectedAttendance: 120,
    },
  });

  const dinner = await db.event.create({
    data: {
      name: "Autumn fundraising dinner",
      type: "FUNDRAISER",
      startsAt: new Date(daysBefore(35).getTime() + 18 * 3_600_000),
      location: "Victoria Park Armoury",
      addressLine: "210 Kent St W, Lindsay",
      isFundraiser: true,
      ticketPriceCents: 10000,
      expectedAttendance: 60,
    },
  });

  await db.event.create({
    data: {
      name: "Saturday morning canvass blitz",
      type: "BLITZ",
      startsAt: new Date(daysBefore(14).getTime() + 10 * 3_600_000),
      location: "Campaign office",
      addressLine: "12 Kent St W, Lindsay",
      description: "All hands. Coffee and turf handed out at 10.",
    },
  });

  console.log("Shifts…");
  const shiftSpecs = [
    { title: "Saturday canvass — downtown core", type: "CANVASS", daysOut: 3, hour: 10, capacity: 6 },
    { title: "Evening phone bank", type: "PHONE_BANK", daysOut: 5, hour: 18, capacity: 4 },
    { title: "Sign install run", type: "SIGN_INSTALL", daysOut: 6, hour: 9, capacity: 3 },
    { title: "Literature drop — west end", type: "LIT_DROP", daysOut: 9, hour: 13, capacity: 5 },
    { title: "Sunday canvass — north of Colborne", type: "CANVASS", daysOut: 11, hour: 13, capacity: 6 },
    { title: "Last Saturday canvass", type: "CANVASS", daysOut: -4, hour: 10, capacity: 6 },
  ];

  for (const spec of shiftSpecs) {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + spec.daysOut);
    startsAt.setHours(spec.hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2.5 * 3_600_000);

    const shift = await db.shift.create({
      data: {
        title: spec.title,
        type: spec.type,
        startsAt,
        endsAt,
        location: "Campaign office, 12 Kent St W",
        capacity: spec.capacity,
        notes: "Clipboards, walk lists and water provided.",
      },
    });

    // Fill most shifts partway, so the roster shows real gaps to chase.
    const signups = intBetween(1, spec.capacity);
    const shuffled = [...volunteers].sort(() => rand() - 0.5).slice(0, signups);
    for (const volunteer of shuffled) {
      const past = spec.daysOut < 0;
      await db.shiftAssignment.create({
        data: {
          shiftId: shift.id,
          volunteerId: volunteer.id,
          status: past ? (chance(0.85) ? "CHECKED_IN" : "NO_SHOW") : chance(0.5) ? "CONFIRMED" : "SIGNED_UP",
          checkedInAt: past && chance(0.85) ? startsAt : null,
          hoursLogged: past && chance(0.85) ? 2.5 : null,
        },
      });
    }
  }

  console.log("Contributors and contributions…");
  const contributorSpecs = [
    { firstName: "Jordan", lastName: "Reyes", isCandidate: true, address: "44 Sussex St N", amounts: [400000] },
    { firstName: "Sam", lastName: "Reyes", isCandidateSpouse: true, address: "44 Sussex St N", amounts: [150000] },
    { firstName: "Eleanor", lastName: "Whitfield", address: "18 Bond St W", amounts: [50000, 50000, 30000] },
    { firstName: "Raj", lastName: "Balakrishnan", address: "212 Angeline St N", amounts: [100000] },
    { firstName: "Denise", lastName: "Corbeil", address: "7 Peel St", amounts: [25000, 25000] },
    { firstName: "Frank", lastName: "Mazur", address: "88 Russell St W", amounts: [12000] },
    { firstName: "Yuki", lastName: "Tanaka", address: "31 Mary St W", amounts: [7500] },
    { firstName: "Colin", lastName: "Hargreaves", address: "", amounts: [45000] },
    { firstName: "Beatrice", lastName: "Odum", address: "150 Colborne St E", amounts: [20000] },
    { firstName: "Wendell", lastName: "Pike", address: "9 Glenelg St W", amounts: [130000] },
    { firstName: "Nadia", lastName: "Haddad", address: "77 Cambridge St S", amounts: [60000] },
    { firstName: "Gordon", lastName: "Leask", address: "4 Adelaide St N", amounts: [3000] },
  ];

  let receiptNumber = 1;
  for (const spec of contributorSpecs) {
    const contributor = await db.contributor.create({
      data: {
        firstName: spec.firstName,
        lastName: spec.lastName,
        addressLine: spec.address,
        city: spec.address ? "Lindsay" : "",
        province: "ON",
        postalCode: spec.address ? "K9V 2A1" : "",
        email: `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}@example.com`,
        isCandidate: spec.isCandidate ?? false,
        isCandidateSpouse: spec.isCandidateSpouse ?? false,
        ontarioResident: true,
      },
    });

    for (const [i, amountCents] of spec.amounts.entries()) {
      // Gordon Leask's $30 in cash is deliberately over the $25 cash ceiling,
      // so the compliance page has a real cash-rule breach to show.
      const isCash = spec.lastName === "Leask";
      await db.contribution.create({
        data: {
          contributorId: contributor.id,
          amountCents,
          receivedAt: daysBefore(intBetween(20, 130)),
          method: isCash ? "CASH" : pick(["CHEQUE", "ETRANSFER", "CREDIT_CARD"]),
          receiptNumber: `R-${String(receiptNumber++).padStart(4, "0")}`,
          receiptIssuedAt: daysBefore(intBetween(20, 130)),
          eventId: i === 0 && chance(0.4) ? pick([kickoff.id, dinner.id]) : null,
        },
      });
    }
  }

  // An in-kind contribution and its matching expense, as the Act requires.
  const printer = await db.contributor.create({
    data: {
      firstName: "Marguerite",
      lastName: "Delisle",
      addressLine: "3 Durham St E",
      city: "Lindsay",
      province: "ON",
      postalCode: "K9V 2N4",
      ontarioResident: true,
    },
  });
  await db.contribution.create({
    data: {
      contributorId: printer.id,
      amountCents: 65000,
      receivedAt: daysBefore(80),
      method: "IN_KIND",
      isInKind: true,
      inKindDescription: "Design and printing of 2,000 door hangers, at fair market value.",
      receiptNumber: `R-${String(receiptNumber++).padStart(4, "0")}`,
      receiptIssuedAt: daysBefore(80),
    },
  });

  // Anonymous cash from the barbecue bucket — lawful because it is $25 or less.
  for (let i = 0; i < 6; i++) {
    await db.contribution.create({
      data: {
        amountCents: intBetween(500, 2500),
        receivedAt: daysBefore(120),
        method: "CASH",
        isAnonymous: true,
        eventId: kickoff.id,
        notes: "Bucket collection at the kickoff barbecue.",
      },
    });
  }

  console.log("Expenses…");
  const expenseSpecs = [
    { description: "Nomination filing fee", vendor: "City of Kawartha Lakes", category: "NOMINATION_FEE", amountCents: 10000, daysBefore: 150 },
    { description: "500 small lawn signs", vendor: "Kawartha Print Co.", category: "SIGNS", amountCents: 187500, daysBefore: 110 },
    { description: "Six 4×8 road signs", vendor: "Kawartha Print Co.", category: "SIGNS", amountCents: 96000, daysBefore: 105 },
    { description: "Door hangers — 2,000 (in kind)", vendor: "M. Delisle", category: "BROCHURES", amountCents: 65000, daysBefore: 80, isInKind: true },
    { description: "Newspaper advertisement — half page", vendor: "Lindsay Advocate", category: "ADVERTISING", amountCents: 62000, daysBefore: 45 },
    { description: "Facebook and Instagram advertising", vendor: "Meta Platforms", category: "ADVERTISING", amountCents: 45000, daysBefore: 30 },
    { description: "Campaign office rent — three months", vendor: "Kent Street Holdings", category: "OFFICE_BEFORE", amountCents: 240000, daysBefore: 100 },
    { description: "Mobile phone and internet", vendor: "Bell", category: "PHONE_BEFORE", amountCents: 32000, daysBefore: 60 },
    { description: "Campaign manager honorarium", vendor: "E. Vasquez", category: "SALARIES_BEFORE", amountCents: 300000, daysBefore: 40 },
    { description: "Bank account monthly fees", vendor: "Kawartha Credit Union", category: "BANK_BEFORE", amountCents: 4500, daysBefore: 90 },
    { description: "Meet-and-greet hall rental", vendor: "Lindsay Legion", category: "MEETINGS_HOSTED", amountCents: 25000, daysBefore: 70 },
    { description: "Kickoff barbecue — food and hall", vendor: "Lindsay Legion", category: "FUNDRAISING_COSTS", amountCents: 118000, daysBefore: 120, eventId: kickoff.id },
    { description: "Autumn dinner — catering", vendor: "Boiling Over's", category: "FUNDRAISING_COSTS", amountCents: 210000, daysBefore: 35, eventId: dinner.id },
    { description: "Financial statement preparation", vendor: "Gagnon & Co. CPA", category: "ACCOUNTING_AUDIT", amountCents: 120000, daysBefore: 5 },
    { description: "Volunteer thank-you party", vendor: "Lindsay Legion", category: "APPRECIATION_PARTY", amountCents: 68000, daysBefore: -7 },
  ];

  const { expenseCategory } = await import("../src/lib/ontario");
  for (const spec of expenseSpecs) {
    const category = expenseCategory(spec.category);
    await db.expense.create({
      data: {
        description: spec.description,
        vendor: spec.vendor,
        category: spec.category,
        amountCents: spec.amountCents,
        incurredAt: daysBefore(spec.daysBefore),
        paidAt: spec.daysBefore > 0 ? daysBefore(spec.daysBefore - 2) : null,
        subjectToLimit: category.subjectToLimit,
        isPartyExpense: category.partyExpense === true,
        isInKind: spec.isInKind ?? false,
        eventId: spec.eventId ?? null,
      },
    });
  }

  console.log("Lawn signs…");
  await db.signInventory.createMany({
    data: [
      { signType: "SMALL_LAWN", quantityOwned: 500 },
      { signType: "LARGE_LAWN", quantityOwned: 60 },
      { signType: "BIG_4X8", quantityOwned: 6 },
      { signType: "WINDOW", quantityOwned: 40 },
    ],
  });

  const signVoters = await db.voter.findMany({
    where: { wantsSign: true },
    include: { household: true },
    take: 40,
  });

  const signCrew = volunteers.filter((v) => v.roles.includes("SIGN_CREW"));
  for (const [i, voter] of signVoters.entries()) {
    const status = i < 18 ? "INSTALLED" : i < 24 ? "SCHEDULED" : i < 30 ? "APPROVED" : "REQUESTED";
    const installed = status === "INSTALLED";
    await db.signRequest.create({
      data: {
        voterId: voter.id,
        requesterName: `${voter.firstName} ${voter.lastName}`.trim(),
        phone: voter.phone,
        email: voter.email,
        addressLine: voter.household
          ? `${voter.household.streetNumber} ${voter.household.streetName}`
          : "",
        city: "Lindsay",
        postalCode: voter.household?.postalCode ?? "",
        ward: "Ward 3",
        signType: chance(0.9) ? "SMALL_LAWN" : "LARGE_LAWN",
        quantity: 1,
        status,
        permissionConfirmed: status !== "REQUESTED",
        requestedAt: daysBefore(intBetween(30, 90)),
        scheduledFor: status === "SCHEDULED" ? daysBefore(intBetween(5, 15)) : null,
        installedAt: installed ? daysBefore(intBetween(10, 60)) : null,
        installedById: installed && signCrew.length > 0 ? pick(signCrew).id : null,
      },
    });
  }

  // One damaged sign, so the "needs repair" column is not always empty.
  const firstInstalled = await db.signRequest.findFirst({ where: { status: "INSTALLED" } });
  if (firstInstalled) {
    await db.signRequest.update({
      where: { id: firstInstalled.id },
      data: { status: "NEEDS_REPAIR", notes: "Knocked over by the wind; post snapped." },
    });
  }

  const counts = {
    voters: await db.voter.count(),
    households: await db.household.count(),
    contacts: await db.contactAttempt.count(),
    volunteers: await db.volunteer.count(),
    contributions: await db.contribution.count(),
    expenses: await db.expense.count(),
    signs: await db.signRequest.count(),
  };
  console.log("Done:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
