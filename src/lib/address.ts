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
