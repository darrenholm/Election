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

/* ------------------------------------------------------ municipalities ---- */

/** Columns that usually name the municipality in an address-point file. */
export const MUNICIPALITY_HINTS = [
  "csdname",
  "csd",
  "municipality",
  "municipalname",
  "city",
  "town",
];

export function guessMunicipalityColumn(headers: string[]): string {
  for (const hint of MUNICIPALITY_HINTS) {
    const match = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === hint);
    if (match) return match;
  }
  return "";
}

/**
 * A loose key for recognising two spellings of the same place.
 *
 * "The Corporation of the Municipality of West Grey", "WEST GREY" and
 * "West Grey" all reduce to "westgrey": the statutory prefix is how the
 * province writes a place, not part of the name anyone uses on a lawn sign.
 *
 * Only that leading "<type> of" construction is dropped. A type word sitting
 * anywhere else is kept, because Ontario has two municipalities called Hamilton
 * — the city, and Hamilton Township in Northumberland — and stripping the word
 * everywhere would merge them into one town with one voters' list. Keeping it
 * means the worst case is a duplicate somebody can see and delete, rather than
 * two towns silently sharing doors.
 *
 * Digits are kept for the same reason: they carry meaning in a name, and
 * dropping them would collapse anything that differs only by a number.
 */
const NAME_PREFIX =
  /^(?:the\s+)?(?:corporation\s+of\s+)?(?:the\s+)?(?:municipality|township|town|city|village|county)\s+of\s+/;

export function simplifyPlace(value: string): string {
  let name = value.toLowerCase().replace(/\s+/g, " ").trim();
  // Applied twice so "The Corporation of the Township of the Archipelago"-style
  // stacked prefixes come off cleanly.
  for (let i = 0; i < 2; i++) name = name.replace(NAME_PREFIX, "");
  return name.replace(/[^a-z0-9]/g, "");
}

// Words that stay lower case inside a place name, and prefixes that keep the
// letter after them capitalised. Ontario has both "Dysart et al" and
// "McNab/Braeside". "Mac" is deliberately not a prefix here: the province's
// Mac names — Machin, Macdonald Meredith and Aberdeen Additional — are written
// flat, and treating it like "Mc" would give "MacHin".
const MINOR_WORDS = new Set([
  "of", "the", "and", "et", "al", "de", "du", "des", "la", "le", "les", "sur", "aux", "à",
]);
const CAPITALISING_PREFIXES = ["mc", "o'"];

/**
 * Title-case a place name that arrived shouting.
 *
 * Address files commonly hold municipality names in capitals. A dropdown of
 * four hundred of those is unreadable, so ALL-CAPS names are cased on the way
 * in — but a name that already has lower-case letters is left exactly as the
 * file wrote it, since somebody has already made a decision about it there.
 */
export function tidyPlaceName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "" || /[a-z]/.test(trimmed)) return trimmed;

  // Hyphens and slashes join two names, and each of them starts fresh:
  // "The Nation / La Nation" keeps both capitals, where "Dysart et al" does
  // not. So the name is walked token by token, tracking whether the last thing
  // seen was a separator.
  const tokens = trimmed.toLowerCase().split(/([-/\s])/);
  let startOfName = true;

  return tokens
    .map((token) => {
      if (token === "" ) return token;
      if (token === " ") return token;
      if (token === "-" || token === "/") {
        startOfName = true;
        return token;
      }
      const cased = startOfName || !MINOR_WORDS.has(token) ? capitalisePart(token) : token;
      startOfName = false;
      return cased;
    })
    .join("");
}

function capitalisePart(part: string): string {
  if (part === "") return part;

  const prefix = CAPITALISING_PREFIXES.find(
    (p) => part.startsWith(p) && part.length > p.length + 1,
  );
  if (prefix) {
    return (
      prefix.charAt(0).toUpperCase() +
      prefix.slice(1) +
      part.charAt(prefix.length).toUpperCase() +
      part.slice(prefix.length + 1)
    );
  }

  return part.charAt(0).toUpperCase() + part.slice(1);
}
