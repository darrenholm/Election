/**
 * Address normalisation, shared by the importer, the voter form and search.
 *
 * These live outside the server-action modules on purpose: a "use server" file
 * may only export async functions, and these are pure helpers that both the
 * server and the page components need.
 */

/** Upper-cased, single-spaced street name so "Main St" and "MAIN  ST" agree. */
export function normaliseStreet(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/** "K9V 4R1" — the format Canada Post prints and voters' lists mangle. */
export function normalisePostal(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (compact.length !== 6) return value.trim().toUpperCase();
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

/**
 * A canonical key for matching one street to another across sources.
 *
 * The municipality's civic address file and the clerk's voters' list are
 * produced by different systems and rarely agree on spelling: "YONGE ST S" in
 * one, "Yonge Street South" in the other; "CONCESSION 6" against "CONC 6";
 * "BRUCE ROAD 15" against "BRUCE RD 15". Matching on the raw name would give
 * every such door two household records and split its voters across them.
 *
 * So the display name is kept as imported, and this normalised key — suffixes
 * and directions reduced to one agreed abbreviation, punctuation dropped — is
 * what the matching actually uses.
 */
const STREET_TYPES: Record<string, string> = {
  STREET: "ST",
  ST: "ST",
  AVENUE: "AVE",
  AVE: "AVE",
  AV: "AVE",
  ROAD: "RD",
  RD: "RD",
  DRIVE: "DR",
  DR: "DR",
  CRESCENT: "CRES",
  CRES: "CRES",
  BOULEVARD: "BLVD",
  BLVD: "BLVD",
  COURT: "CRT",
  CRT: "CRT",
  CT: "CRT",
  LANE: "LANE",
  LN: "LANE",
  PLACE: "PL",
  PL: "PL",
  TRAIL: "TRL",
  TRL: "TRL",
  TERRACE: "TERR",
  TERR: "TERR",
  CIRCLE: "CIR",
  CIR: "CIR",
  HIGHWAY: "HWY",
  HWY: "HWY",
  CONCESSION: "CONC",
  CONC: "CONC",
  SIDEROAD: "SDRD",
  SIDERD: "SDRD",
  SDRD: "SDRD",
  PARKWAY: "PKWY",
  PKWY: "PKWY",
  SQUARE: "SQ",
  SQ: "SQ",
  GARDENS: "GDNS",
  GDNS: "GDNS",
  HEIGHTS: "HTS",
  HTS: "HTS",
};

const DIRECTIONS: Record<string, string> = {
  NORTH: "N",
  N: "N",
  SOUTH: "S",
  S: "S",
  EAST: "E",
  E: "E",
  WEST: "W",
  W: "W",
  NORTHEAST: "NE",
  NE: "NE",
  NORTHWEST: "NW",
  NW: "NW",
  SOUTHEAST: "SE",
  SE: "SE",
  SOUTHWEST: "SW",
  SW: "SW",
};

export function canonicalStreet(value: string): string {
  const words = value
    .toUpperCase()
    .replace(/[.,'']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "";

  return words
    .map((word, i) => {
      // Only the tail of the name carries a type or a direction; "WEST ST" and
      // "ST GEORGE ST" would otherwise be mangled at the front.
      const atEnd = i >= words.length - 2;
      if (atEnd && DIRECTIONS[word]) return DIRECTIONS[word];
      if (atEnd && STREET_TYPES[word]) return STREET_TYPES[word];
      return word;
    })
    .join(" ");
}
