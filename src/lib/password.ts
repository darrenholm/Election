import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt rather than a bcrypt package because it is built in — one fewer native
 * dependency to break a deploy — and it is memory-hard, which is what actually
 * slows an attacker with a GPU. Stored as "salt:key" in hex.
 */

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  // Constant-time: a length check has already guaranteed both are KEY_LENGTH.
  return timingSafeEqual(derived, expected);
}

/** A readable temporary password for an account someone else will first use. */
export function temporaryPassword(): string {
  // Ambiguous characters left out: nobody should have to work out whether the
  // password they were read over the phone had a one or an ell in it.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export type PasswordProblem = string | null;

/** Minimum bar for a password protecting a voters' list. */
export function checkPasswordStrength(password: string): PasswordProblem {
  if (password.length < 12) return "Use at least 12 characters.";
  if (/^\d+$/.test(password)) return "Use more than just digits.";
  const common = ["password", "campaign", "12345678", "qwerty", "letmein"];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    return "That contains a word attackers try first. Pick something less obvious.";
  }
  return null;
}
