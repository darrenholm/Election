/**
 * Value sets for the String columns in prisma/schema.prisma. The SQLite
 * connector has no native enums, so these constants are the single source of
 * truth: forms render from them, zod validates against them, and the UI labels
 * come from the same place.
 */

export type Option<T extends string> = { value: T; label: string };

function options<T extends string>(map: Record<T, string>): Option<T>[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }));
}

/* ------------------------------------------------------------------ campaign */

export const OFFICES = {
  HEAD_OF_COUNCIL: "Head of council (mayor / reeve)",
  COUNCILLOR: "Councillor",
  SCHOOL_TRUSTEE: "School board trustee",
  OTHER: "Other local office",
} as const;
export type Office = keyof typeof OFFICES;
export const OFFICE_OPTIONS = options(OFFICES);

/* -------------------------------------------------------------------- voters */

/** The classic 1–5 support scale used on nearly every canvass sheet. */
export const SUPPORT_LEVELS = {
  1: "1 — Strong support",
  2: "2 — Lean support",
  3: "3 — Undecided",
  4: "4 — Lean oppose",
  5: "5 — Strong oppose",
} as const;
export type SupportLevel = 1 | 2 | 3 | 4 | 5;
export const SUPPORT_LEVEL_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: n as SupportLevel,
  label: SUPPORT_LEVELS[n as SupportLevel],
}));

/** Colour per support level, used consistently by badges, bars and lists. */
export const SUPPORT_COLORS: Record<SupportLevel, string> = {
  1: "bg-emerald-600",
  2: "bg-lime-500",
  3: "bg-amber-500",
  4: "bg-orange-500",
  5: "bg-rose-600",
};

export const SUPPORT_TEXT_COLORS: Record<SupportLevel, string> = {
  1: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 ring-emerald-600/30",
  2: "text-lime-700 dark:text-lime-300 bg-lime-50 dark:bg-lime-950 ring-lime-600/30",
  3: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 ring-amber-600/30",
  4: "text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 ring-orange-600/30",
  5: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 ring-rose-600/30",
};

/* ---------------------------------------------------------------- canvassing */

export const CONTACT_METHODS = {
  DOOR: "Door knock",
  PHONE: "Phone",
  TEXT: "Text message",
  EMAIL: "Email",
  EVENT: "Event / street",
  MAIL: "Mail",
} as const;
export type ContactMethod = keyof typeof CONTACT_METHODS;
export const CONTACT_METHOD_OPTIONS = options(CONTACT_METHODS);

export const CONTACT_RESULTS = {
  SPOKE: "Spoke with voter",
  NOT_HOME: "Not home",
  REFUSED: "Refused / not interested",
  LEFT_LITERATURE: "Left literature",
  MOVED: "Moved away",
  DECEASED: "Deceased",
  LANGUAGE_BARRIER: "Language barrier",
  INACCESSIBLE: "Could not access door",
  BAD_NUMBER: "Wrong or dead number",
} as const;
export type ContactResult = keyof typeof CONTACT_RESULTS;
export const CONTACT_RESULT_OPTIONS = options(CONTACT_RESULTS);

/** Results that mean a real conversation happened — the canvass "contact rate". */
export const CONVERSATION_RESULTS: ContactResult[] = ["SPOKE"];

export const TURF_STATUSES = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
} as const;
export type TurfStatus = keyof typeof TURF_STATUSES;
export const TURF_STATUS_OPTIONS = options(TURF_STATUSES);

/* ---------------------------------------------------------------- volunteers */

export const VOLUNTEER_STATUSES = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
} as const;
export type VolunteerStatus = keyof typeof VOLUNTEER_STATUSES;
export const VOLUNTEER_STATUS_OPTIONS = options(VOLUNTEER_STATUSES);

export const VOLUNTEER_ROLES = {
  CANVASSER: "Canvasser",
  PHONE_BANKER: "Phone banker",
  DRIVER: "Driver",
  SIGN_CREW: "Sign crew",
  DATA_ENTRY: "Data entry",
  SCRUTINEER: "Scrutineer",
  SOCIAL_MEDIA: "Social media",
  FUNDRAISING: "Fundraising",
  EVENT_HELP: "Event help",
  LIT_DROP: "Literature drop",
} as const;
export type VolunteerRole = keyof typeof VOLUNTEER_ROLES;
export const VOLUNTEER_ROLE_OPTIONS = options(VOLUNTEER_ROLES);

/* -------------------------------------------------------------------- shifts */

export const SHIFT_TYPES = {
  CANVASS: "Door canvass",
  PHONE_BANK: "Phone bank",
  LIT_DROP: "Literature drop",
  SIGN_INSTALL: "Sign install",
  SIGN_RETRIEVAL: "Sign retrieval",
  EVENT: "Event",
  OFFICE: "Office / admin",
  GOTV: "Get out the vote",
} as const;
export type ShiftType = keyof typeof SHIFT_TYPES;
export const SHIFT_TYPE_OPTIONS = options(SHIFT_TYPES);

export const ASSIGNMENT_STATUSES = {
  SIGNED_UP: "Signed up",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No show",
  CANCELLED: "Cancelled",
} as const;
export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUSES;
export const ASSIGNMENT_STATUS_OPTIONS = options(ASSIGNMENT_STATUSES);

/** Statuses that occupy a seat when checking a shift against its capacity. */
export const OCCUPYING_STATUSES: AssignmentStatus[] = [
  "SIGNED_UP",
  "CONFIRMED",
  "CHECKED_IN",
];

/* ------------------------------------------------------------------- finance */

export const CONTRIBUTION_METHODS = {
  CHEQUE: "Cheque",
  ETRANSFER: "E-transfer",
  CREDIT_CARD: "Credit / debit card",
  ONLINE: "Online payment",
  CASH: "Cash",
  IN_KIND: "Goods or services (in-kind)",
  OTHER: "Other",
} as const;
export type ContributionMethod = keyof typeof CONTRIBUTION_METHODS;
export const CONTRIBUTION_METHOD_OPTIONS = options(CONTRIBUTION_METHODS);

/* --------------------------------------------------------------------- signs */

export const SIGN_TYPES = {
  SMALL_LAWN: "Small lawn sign",
  LARGE_LAWN: "Large lawn sign",
  BIG_4X8: "4' × 8' road sign",
  WINDOW: "Window / storefront",
} as const;
export type SignType = keyof typeof SIGN_TYPES;
export const SIGN_TYPE_OPTIONS = options(SIGN_TYPES);

export const SIGN_STATUSES = {
  REQUESTED: "Requested",
  APPROVED: "Approved — ready to install",
  SCHEDULED: "Scheduled",
  INSTALLED: "Installed",
  NEEDS_REPAIR: "Needs repair / replacement",
  REMOVED: "Removed",
  DECLINED: "Declined / cancelled",
} as const;
export type SignStatus = keyof typeof SIGN_STATUSES;
export const SIGN_STATUS_OPTIONS = options(SIGN_STATUSES);

/** Statuses where a sign is physically out of the garage. */
export const DEPLOYED_SIGN_STATUSES: SignStatus[] = ["INSTALLED", "NEEDS_REPAIR"];
/** Statuses still waiting on the sign crew. */
export const PENDING_SIGN_STATUSES: SignStatus[] = ["REQUESTED", "APPROVED", "SCHEDULED"];

/* -------------------------------------------------------------------- events */

export const EVENT_TYPES = {
  FUNDRAISER: "Fundraiser",
  MEET_GREET: "Meet and greet",
  ALL_CANDIDATES: "All-candidates meeting",
  DEBATE: "Debate",
  BLITZ: "Canvass blitz",
  PARADE: "Parade / festival",
  OFFICE_OPENING: "Office opening",
  MEDIA: "Media / interview",
  OTHER: "Other",
} as const;
export type EventType = keyof typeof EVENT_TYPES;
export const EVENT_TYPE_OPTIONS = options(EVENT_TYPES);

/* ------------------------------------------------------------------ mapping */

export const GEOCODE_STATUSES = {
  PENDING: "Not geocoded yet",
  OK: "Located",
  FAILED: "Could not be located",
  MANUAL: "Pinned by hand",
} as const;
export type GeocodeStatus = keyof typeof GEOCODE_STATUSES;
export const GEOCODE_STATUS_OPTIONS = options(GEOCODE_STATUSES);

/**
 * Google's location_type, worst to best. Anything below ROOFTOP on a rural
 * road is a guess at the road centre rather than the driveway, so the map
 * flags it and the crew can drop a pin properly.
 */
export const GEOCODE_PRECISION = {
  ROOFTOP: "Exact address",
  RANGE_INTERPOLATED: "Interpolated along the street",
  GEOMETRIC_CENTER: "Centre of the street",
  APPROXIMATE: "Approximate only",
} as const;
export type GeocodePrecision = keyof typeof GEOCODE_PRECISION;

/** Precision values worth a second look before trusting the pin. */
export const IMPRECISE_GEOCODES: string[] = ["GEOMETRIC_CENTER", "APPROXIMATE"];

/* ------------------------------------------------------------------ consent */

export const SMS_CONSENT_STATES = {
  UNKNOWN: "Not asked",
  GRANTED: "Agreed to texts",
  DECLINED: "Said no",
  REVOKED: "Opted out",
} as const;
export type SmsConsent = keyof typeof SMS_CONSENT_STATES;
export const SMS_CONSENT_OPTIONS = options(SMS_CONSENT_STATES);

export const SMS_CONSENT_SOURCES = {
  DOOR: "At the door",
  PHONE: "On the phone",
  EVENT: "At an event",
  WEB: "Web form",
  IMPORT: "Imported with consent record",
} as const;
export type SmsConsentSource = keyof typeof SMS_CONSENT_SOURCES;
export const SMS_CONSENT_SOURCE_OPTIONS = options(SMS_CONSENT_SOURCES);

/* ------------------------------------------------------------------ texting */

export const TEXT_CAMPAIGN_STATUSES = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
} as const;
export type TextCampaignStatus = keyof typeof TEXT_CAMPAIGN_STATUSES;
export const TEXT_CAMPAIGN_STATUS_OPTIONS = options(TEXT_CAMPAIGN_STATUSES);

export const TEXT_MESSAGE_STATUSES = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  UNDELIVERED: "Undelivered",
  SKIPPED: "Skipped",
} as const;
export type TextMessageStatus = keyof typeof TEXT_MESSAGE_STATUSES;

/* ------------------------------------------------------------------- helpers */


export function label<T extends string>(map: Record<T, string>, key: string): string {
  return (map as Record<string, string>)[key] ?? key;
}

/** Split a comma-separated column (roles, tags, issues) into trimmed values. */
export function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinList(values: readonly string[]): string {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).join(",");
}
