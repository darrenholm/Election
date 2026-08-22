/**
 * Single shared password for the whole campaign team.
 *
 * This database holds voter names, home addresses and phone numbers, so any
 * deployment reachable from the internet must set APP_PASSWORD. When the
 * variable is unset the gate is off, which is the right behaviour for running
 * on a laptop and the wrong behaviour anywhere else — the dashboard says so
 * loudly.
 *
 * The session cookie carries a SHA-256 digest of the password plus a fixed
 * salt rather than the password itself, so the plaintext never travels back to
 * the browser. Web Crypto is used throughout so the same helpers work in the
 * Node runtime (server actions) and the edge runtime (middleware).
 */

export const SESSION_COOKIE = "campaign_session";
const SALT = "municipal-campaign-manager:v1";

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SALT}:${value}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The value a valid session cookie should hold for the current password. */
export async function sessionToken(): Promise<string> {
  return digest(process.env.APP_PASSWORD ?? "");
}

/** Length-independent comparison so a wrong guess leaks no timing signal. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return true;
  return safeEqual(await digest(candidate), await digest(expected));
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken());
}
