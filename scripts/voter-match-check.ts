/**
 * Does the voters' list matcher still recognise the same people?
 *
 * Run after touching src/lib/voter-match.ts. Needs no credentials, no network
 * and no database: it feeds the matcher a small file of people already on
 * file and a re-issued list of the same people, and checks each row lands
 * where it should.
 *
 * The cases are the ways the clerk's list has actually been seen to move
 * between issues — renumbered ids, accents dropped, a given name shortened,
 * a marriage, a move — plus the ones where the honest answer is "cannot tell",
 * because a wrong match writes one person's details over another's.
 */

import {
  indexCandidates,
  matchVoter,
  nameKey,
  diffVoter,
  type MatchCandidate,
  type MatchOutcome,
} from "../src/lib/voter-match";
import { splitPersonName, splitStreetAddress } from "../src/lib/voter-columns";

function voter(
  id: string,
  externalId: string | null,
  firstName: string,
  lastName: string,
  address: [string, string, string, string] | null,
  extra: { middleName?: string; email?: string; phone?: string } = {},
): MatchCandidate {
  return {
    id,
    externalId,
    firstName,
    lastName,
    middleName: extra.middleName ?? "",
    email: extra.email ?? "",
    phone: extra.phone ?? "",
    household: address
      ? { streetNumber: address[0], streetName: address[1], unit: address[2], city: address[3] }
      : null,
  };
}

/** The voter file these cases are matched against. */
const ON_FILE: MatchCandidate[] = [
  voter("v-marie", "1001", "Marie", "Dubé", ["12", "Main Street", "", "Walkerton"], {
    phone: "519-555-0100",
  }),
  voter("v-robert", "1002", "Robert", "Schmidt", ["44", "Yonge St S", "", "Walkerton"]),
  // Two John Smiths, one town. Only the address tells them apart.
  voter("v-john-a", "1003", "John", "Smith", ["7", "Durham Rd", "", "Walkerton"]),
  voter("v-john-b", "1004", "John", "Smith", ["310", "Jackson St", "2", "Walkerton"]),
  // Two Pat Kellys at one door — a parent and child sharing an initial.
  voter("v-pat-a", "1005", "Patricia", "Kelly", ["9", "Orange St", "", "Walkerton"]),
  voter("v-pat-b", "1006", "Peter", "Kelly", ["9", "Orange St", "", "Walkerton"]),
  voter("v-nolist", null, "Hélène", "Tremblay", ["88", "Colborne Street", "", "Walkerton"]),
];

type Matched = Extract<MatchOutcome, { kind: "match" }>;

type Case = {
  what: string;
  row: Record<string, string>;
  expect: {
    voterId: string | null;
    /** Only meaningful when a match is expected. */
    matchedBy?: Matched["matchedBy"];
    /** Only meaningful when no match is expected. */
    rivals?: number;
  };
};

const CASES: Case[] = [
  {
    what: "the list ID still carries, and beats a changed name",
    row: { externalId: "1001", firstName: "Marie", lastName: "Dube-Fortin" },
    expect: { voterId: "v-marie", matchedBy: "listId" },
  },
  {
    what: "the clerk renumbered the list, so the name has to carry it",
    row: {
      externalId: "7742",
      firstName: "Marie",
      lastName: "Dubé",
      streetNumber: "12",
      streetName: "Main Street",
      city: "Walkerton",
    },
    expect: { voterId: "v-marie", matchedBy: "nameAndAddress" },
  },
  {
    what: "the accent was dropped on the way out of the clerk's system",
    row: {
      firstName: "MARIE",
      lastName: "DUBE",
      streetNumber: "12",
      streetName: "Main St",
      city: "Walkerton",
    },
    expect: { voterId: "v-marie", matchedBy: "nameAndAddress" },
  },
  {
    what: "no list ID anywhere, and the street is spelled the other way",
    row: {
      firstName: "Hélène",
      lastName: "Tremblay",
      streetNumber: "88",
      streetName: "Colborne St",
      city: "Walkerton",
    },
    expect: { voterId: "v-nolist", matchedBy: "nameAndAddress" },
  },
  {
    what: "a given name shortened between issues, with the door unchanged",
    row: {
      firstName: "Rob",
      lastName: "Schmidt",
      streetNumber: "44",
      streetName: "Yonge Street South",
      city: "Walkerton",
    },
    expect: { voterId: "v-robert", matchedBy: "nameAndAddress" },
  },
  {
    what: "a name match with no address at all is still a match",
    row: { firstName: "Robert", lastName: "Schmidt" },
    expect: { voterId: "v-robert", matchedBy: "name" },
  },
  {
    what: "one of two John Smiths, settled by the address",
    row: {
      firstName: "John",
      lastName: "Smith",
      streetNumber: "310",
      streetName: "Jackson Street",
      unit: "2",
      city: "Walkerton",
    },
    expect: { voterId: "v-john-b", matchedBy: "nameAndAddress" },
  },
  {
    what: "a John Smith at neither known address — cannot tell, so add",
    row: {
      firstName: "John",
      lastName: "Smith",
      streetNumber: "500",
      streetName: "Bruce Rd 4",
      city: "Walkerton",
    },
    expect: { voterId: null, rivals: 2 },
  },
  {
    what: "a John Smith with no address at all — cannot tell, so add",
    row: { firstName: "John", lastName: "Smith" },
    expect: { voterId: null, rivals: 2 },
  },
  {
    what: "an initial shared by two people at one door — cannot tell, so add",
    row: {
      firstName: "P",
      lastName: "Kelly",
      streetNumber: "9",
      streetName: "Orange St",
      city: "Walkerton",
    },
    expect: { voterId: null, rivals: 2 },
  },
  {
    what: "a genuinely new voter",
    row: {
      firstName: "Aisha",
      lastName: "Okonkwo",
      streetNumber: "3",
      streetName: "Victoria St",
      city: "Walkerton",
    },
    expect: { voterId: null, rivals: 0 },
  },
  {
    what: "an initial alone, with no address, never matches",
    row: { firstName: "R", lastName: "Schmidt" },
    expect: { voterId: null, rivals: 0 },
  },
  {
    what: "a blank row matches nothing",
    row: { streetNumber: "12", streetName: "Main Street", city: "Walkerton" },
    expect: { voterId: null, rivals: 0 },
  },
];

const problems: string[] = [];

// The real plan pass queries by list ID and by surname; both lists are narrowed
// from the same voter file, so handing the matcher all of it is the same input.
const index = indexCandidates(ON_FILE, ON_FILE);

for (const testCase of CASES) {
  const outcome = matchVoter(testCase.row, index);
  const got = outcome.kind === "match" ? outcome.voter.id : null;

  if (got !== testCase.expect.voterId) {
    problems.push(
      `${testCase.what}\n    expected ${testCase.expect.voterId ?? "no match"}, got ${got ?? "no match"}`,
    );
    continue;
  }
  if (outcome.kind === "match" && testCase.expect.matchedBy && outcome.matchedBy !== testCase.expect.matchedBy) {
    problems.push(
      `${testCase.what}\n    expected a ${testCase.expect.matchedBy} match, got ${outcome.matchedBy}`,
    );
  }
  if (outcome.kind === "none" && testCase.expect.rivals !== undefined && outcome.rivals !== testCase.expect.rivals) {
    problems.push(
      `${testCase.what}\n    expected ${testCase.expect.rivals} rival(s), got ${outcome.rivals}`,
    );
  }
}

/* The diff decides what an update actually writes, so it is checked here too:
   a list that carries no phone column must leave the campaign's own numbers
   alone rather than blanking them. */
const diff = diffVoter(
  {
    firstName: "Marie",
    middleName: "",
    lastName: "Dubé",
    email: "",
    phone: "519-555-0100",
    address: "12 Main Street, Walkerton",
  },
  { firstName: "Marie", lastName: "Dubé", address: "14 Main Street, Walkerton" },
);
if (diff.length !== 1 || diff[0].field !== "address") {
  problems.push(
    `an update writes only what the list carries\n    expected the address alone, got ${
      diff.map((d) => d.field).join(", ") || "nothing"
    }`,
  );
}

if (nameKey("O'Brien-Smith") !== nameKey("obrien smith")) {
  problems.push("punctuation and spacing still change a name key");
}

/* Some lists put the whole name in one column and the whole street in another.
   Brockton's assessment roll does both, and importing those as they stand gives
   a surname of "GIBSON  CHERYL LYNN" that matches nobody. */
const NAME_SPLITS: [string, string, string, string][] = [
  // input, last, first, middle
  ["GIBSON  CHERYL LYNN", "GIBSON", "CHERYL", "LYNN"],
  ["GIBSON, CHERYL LYNN", "GIBSON", "CHERYL", "LYNN"],
  ["GIBSON CHERYL LYNN", "GIBSON", "CHERYL", "LYNN"],
  // A surname with a space survives the comma and the double space, which is
  // the reason both are preferred over splitting at the first space.
  ["VAN DER BERG  ANNA", "VAN DER BERG", "ANNA", ""],
  ["VAN DER BERG, ANNA MARIE", "VAN DER BERG", "ANNA", "MARIE"],
  // Stray whitespace from a fixed-width dump must not become part of a name.
  ["  GIBSON  CHERYL  ", "GIBSON", "CHERYL", ""],
  ["GIBSON", "GIBSON", "", ""],
  ["", "", "", ""],
];
for (const [input, last, first, middle] of NAME_SPLITS) {
  const got = splitPersonName(input);
  if (got.lastName !== last || got.firstName !== first || got.middleName !== middle) {
    problems.push(
      `splitting the name "${input}"\n    expected ${last} / ${first} / ${middle || "-"}, got ${got.lastName} / ${got.firstName} / ${got.middleName || "-"}`,
    );
  }
}

const STREET_SPLITS: [string, string, string][] = [
  ["58 CONCESSION 4 E", "58", "CONCESSION 4 E"],
  ["5421 SECOND LINE ERIN", "5421", "SECOND LINE ERIN"],
  ["12A Main St", "12A", "Main St"],
  ["58-60 Main St", "58-60", "Main St"],
  // A rural road with no civic number keeps its name rather than inventing one.
  ["CONCESSION 4 E", "", "CONCESSION 4 E"],
  ["", "", ""],
];
for (const [input, number, street] of STREET_SPLITS) {
  const got = splitStreetAddress(input);
  if (got.streetNumber !== number || got.streetName !== street) {
    problems.push(
      `splitting the address "${input}"\n    expected ${number || "(none)"} / ${street}, got ${got.streetNumber || "(none)"} / ${got.streetName}`,
    );
  }
}

/* And the point of all that: a row from a one-column list has to find the
   person the earlier list already put on file. */
const combined = splitPersonName("GIBSON  CHERYL LYNN");
const combinedStreet = splitStreetAddress("58 CONCESSION 4 E");
const onFile = indexCandidates([], [
  voter("v-cheryl", null, "Cheryl", "Gibson", ["58", "Concession 4 E", "", "Mildmay"], {
    middleName: "Lynn",
  }),
]);
const reunited = matchVoter(
  {
    firstName: combined.firstName,
    lastName: combined.lastName,
    streetNumber: combinedStreet.streetNumber,
    streetName: combinedStreet.streetName,
    city: "MILDMAY",
  },
  onFile,
);
if (reunited.kind !== "match" || reunited.voter.id !== "v-cheryl") {
  problems.push(
    "a split one-column row no longer finds the person already on file\n    expected v-cheryl, got " +
      (reunited.kind === "match" ? reunited.voter.id : "no match"),
  );
}

const checked = CASES.length + NAME_SPLITS.length + STREET_SPLITS.length;

if (problems.length === 0) {
  console.log(
    `The voters' list importer handles all ${checked} cases: ${CASES.length} matches, ` +
      `${NAME_SPLITS.length} name splits, ${STREET_SPLITS.length} address splits.`,
  );
  process.exit(0);
}

for (const problem of problems) console.log(problem);
console.log(`\n${problems.length} to sort out.`);
process.exit(1);
