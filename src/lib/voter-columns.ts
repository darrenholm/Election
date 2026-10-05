/**
 * Pulling two fields out of one column.
 *
 * Clerks' lists do not agree on how much goes in a column. Some give first
 * name, middle name and surname in three; the one Brockton's assessment roll
 * produces gives a single `name` column reading "GIBSON  CHERYL LYNN", and a
 * single `Address Line 1` reading "58 CONCESSION 4 E".
 *
 * Importing those as-is is quietly useless: a surname of "GIBSON  CHERYL LYNN"
 * matches nobody already on file, so a re-import of the same people reads as
 * a town of strangers. These split them back apart so the matching has
 * something to work with.
 *
 * Pure helpers in their own module: the import wizard needs them on the client
 * to show what a column would become before anything is sent.
 */

export type SplitName = {
  firstName: string;
  middleName: string;
  lastName: string;
};

/**
 * Split a single name column that puts the surname first.
 *
 * Three spellings turn up, in this order of confidence:
 *
 *   "GIBSON, CHERYL LYNN"   a comma marks the surname exactly
 *   "GIBSON  CHERYL LYNN"   two or more spaces, which is what a fixed-width
 *                           report leaves behind when it is dumped to CSV
 *   "GIBSON CHERYL LYNN"    one space, so only the first word can be the
 *                           surname
 *
 * The comma and the double space are worth preferring because they survive a
 * surname that has a space in it — "VAN DER BERG  ANNA" keeps all three words
 * where the single-space guess would take only "VAN".
 */
export function splitPersonName(value: string): SplitName {
  const trimmed = value.replace(/\s+$/, "").replace(/^\s+/, "");
  if (trimmed === "") return { firstName: "", middleName: "", lastName: "" };

  let surname: string;
  let given: string;

  const comma = trimmed.indexOf(",");
  const gap = trimmed.search(/\s{2,}/);

  if (comma !== -1) {
    surname = trimmed.slice(0, comma);
    given = trimmed.slice(comma + 1);
  } else if (gap !== -1) {
    surname = trimmed.slice(0, gap);
    given = trimmed.slice(gap);
  } else {
    const space = trimmed.indexOf(" ");
    if (space === -1) return { firstName: "", middleName: "", lastName: trimmed };
    surname = trimmed.slice(0, space);
    given = trimmed.slice(space + 1);
  }

  const names = given.trim().split(/\s+/).filter(Boolean);
  return {
    lastName: surname.trim().replace(/\s+/g, " "),
    firstName: names[0] ?? "",
    // Everything after the given name is a middle name, however many there are:
    // "CHERYL LYNN MARIE" keeps "LYNN MARIE" rather than dropping one.
    middleName: names.slice(1).join(" "),
  };
}

export type SplitStreet = {
  streetNumber: string;
  streetName: string;
};

/**
 * Split "58 CONCESSION 4 E" into the civic number and the street.
 *
 * The number has to come off the front for walk lists to sort down a street in
 * door order rather than alphabetically, which is the whole reason the two are
 * stored apart.
 *
 * A leading number may carry a letter ("12A") or be a range ("58-60"), both of
 * which belong with the number. A line that starts with no number at all — a
 * rural road with only a name, or a lot description — keeps the whole string as
 * the street, since inventing a number would be worse than having none.
 */
const LEADING_NUMBER = /^(\d+\s*[A-Za-z]?(?:\s*[-–]\s*\d+\s*[A-Za-z]?)?)\s+(\S.*)$/;

export function splitStreetAddress(value: string): SplitStreet {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "") return { streetNumber: "", streetName: "" };

  const match = LEADING_NUMBER.exec(trimmed);
  if (!match) return { streetNumber: "", streetName: trimmed };

  return {
    streetNumber: match[1].replace(/\s+/g, ""),
    streetName: match[2].trim(),
  };
}
