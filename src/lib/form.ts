import { parseCents } from "./money";
import { parseDate } from "./dates";

/**
 * Small readers for FormData. Server actions receive everything as strings, and
 * these keep the actions themselves readable: each field is one call that
 * either produces a usable value or a well-defined empty.
 */

export function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

/** Null rather than "" — for optional columns and relation ids. */
export function strOrNull(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value === "" ? null : value;
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function int(form: FormData, key: string, fallback = 0): number {
  const value = Number(str(form, key).replace(/[,\s]/g, ""));
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function intOrNull(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (raw === "") return null;
  const value = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function floatOrNull(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function cents(form: FormData, key: string, fallback = 0): number {
  return parseCents(str(form, key)) ?? fallback;
}

export function centsOrNull(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (raw === "") return null;
  return parseCents(raw);
}

export function date(form: FormData, key: string): Date | null {
  return parseDate(form.get(key));
}

/** Multi-value fields (checkbox groups, multi-selects) as a clean string list. */
export function list(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Constrain a free-form value to a known set, falling back to a default. */
export function oneOf<T extends string>(
  form: FormData,
  key: string,
  allowed: readonly T[] | Record<T, unknown>,
  // NoInfer keeps the union coming from `allowed` alone; without it the
  // fallback widens T and every comparison against the result goes stale.
  fallback: NoInfer<T>,
): T {
  const value = str(form, key) as T;
  const keys = Array.isArray(allowed) ? allowed : (Object.keys(allowed) as T[]);
  return keys.includes(value) ? value : fallback;
}
