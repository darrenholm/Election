/**
 * Text-message consent.
 *
 * Canada's anti-spam law and the carriers both expect the same three things of
 * anyone sending bulk texts: express consent obtained before sending, clear
 * identification of who is sending, and a working way out. This module holds
 * the wording and the phone normalisation so every part of the app — the door
 * script, the voter form, the audience builder and the sender — agrees on what
 * consent means and which number it belongs to.
 */

/**
 * The script a canvasser reads at the door. Stored verbatim on the voter record
 * at the moment consent is given, because a consent record you cannot produce
 * the wording for is worth very little if anyone ever asks.
 */
export const DOOR_CONSENT_SCRIPT =
  "Would it be alright if the campaign sent you the occasional text message about the election? You can reply STOP at any time to opt out.";

export const WEB_CONSENT_SCRIPT =
  "I agree to receive text messages from this campaign about the municipal election. I can reply STOP at any time to opt out.";

/** Appended to every outgoing message; the carriers require a way out in-message. */
export const OPT_OUT_SUFFIX = "Reply STOP to opt out.";

/** Words that opt a number out when texted back to the campaign number. */
export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET"];

export function isStopKeyword(body: string): boolean {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return STOP_KEYWORDS.includes(word);
}

/** Words that opt a number back in. */
export const START_KEYWORDS = ["START", "YES", "UNSTOP"];

export function isStartKeyword(body: string): boolean {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return START_KEYWORDS.includes(word);
}

/**
 * Normalise a Canadian number to E.164 (+15195551234).
 *
 * Numbers are typed at the door in every imaginable format, and an opt-out
 * recorded against "519-555-1234" must block "(519) 555 1234" too — so every
 * comparison in the app goes through this.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already-international numbers are passed through if they look plausible.
  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** "(519) 555-1234" for display. */
export function formatPhone(input: string): string {
  const e164 = normalisePhone(input);
  if (!e164 || !e164.startsWith("+1") || e164.length !== 12) return input;
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isTextableNumber(input: string): boolean {
  return normalisePhone(input) !== null;
}

/**
 * GSM-7 vs UCS-2 segment counting. Getting this right matters because it is
 * what the send actually costs: one curly apostrophe pasted from a word
 * processor pushes a message into UCS-2 and can double the bill.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export type SegmentInfo = {
  characters: number;
  segments: number;
  encoding: "GSM-7" | "UCS-2";
  /** Characters that forced UCS-2, so the composer can point them out. */
  offenders: string[];
};

export function countSegments(body: string): SegmentInfo {
  const chars = Array.from(body);
  const offenders = Array.from(
    new Set(chars.filter((c) => !GSM7.includes(c) && !GSM7_EXTENDED.includes(c))),
  );

  if (offenders.length > 0) {
    const length = chars.length;
    const segments = length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67);
    return { characters: length, segments, encoding: "UCS-2", offenders };
  }

  // Extended characters take two septets each.
  const length = chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
  const segments = length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153);
  return { characters: length, segments, encoding: "GSM-7", offenders: [] };
}

/** Fill {{firstName}} / {{lastName}} for one recipient. */
export function renderMessage(
  template: string,
  voter: { firstName: string; lastName: string } | null,
): string {
  const first = (voter?.firstName ?? "").trim();
  const last = (voter?.lastName ?? "").trim();
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, titleCaseWord(first) || "neighbour")
    .replace(/\{\{\s*lastName\s*\}\}/gi, titleCaseWord(last));
}

function titleCaseWord(value: string): string {
  if (value === "") return "";
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
