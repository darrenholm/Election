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

/**
 * Offices, as they matter to the Act.
 *
 * Only "head of council" — the mayor or reeve — carries the higher base amount
 * in the spending and self-funding formulas. A deputy mayor or deputy reeve is
 * a separate office and takes the ordinary base, so it is listed explicitly
 * rather than left to be filed under "other": the label appears on Form 4 Box A,
 * and a filing should say what the candidate actually ran for.
 */
export const OFFICES = {
  HEAD_OF_COUNCIL: "Head of council (mayor / reeve)",
  DEPUTY_HEAD_OF_COUNCIL: "Deputy mayor / deputy reeve",
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

/**
 * Colour per support level, used consistently by badges, bars and lists.
 *
 * A diverging scale, not a rainbow: blue for support, a neutral grey for
 * undecided, red for oppose. Support and opposition are opposite ends of one
 * axis, and that is what a diverging scale is for — the old green-amber-red
 * ramp encoded the same thing as five unrelated hues.
 *
 * It is also the accessible choice, which is not a coincidence. Green-to-red is
 * the classic failure: on the previous ramp, "lean support" and "undecided" came
 * out ΔE 1.5 apart for a reader with deuteranopia — the same colour. Blue
 * against red is the pairing colour blindness leaves alone. These steps were
 * checked rather than eyeballed, against both surfaces, and clear the CVD and
 * normal-vision floors with the neutral midpoint the scale requires.
 */
export const SUPPORT_COLORS: Record<SupportLevel, string> = {
  1: "bg-[#24499f] dark:bg-[#a3c6ff]",
  2: "bg-[#3b82f6] dark:bg-[#3a6fd4]",
  3: "bg-[#9ca3af] dark:bg-[#8b909c]",
  4: "bg-[#ef4444] dark:bg-[#c93a32]",
  5: "bg-[#a81f1f] dark:bg-[#ff9b91]",
};

export const SUPPORT_TEXT_COLORS: Record<SupportLevel, string> = {
  1: "text-[#1d3c86] dark:text-[#a3c6ff] bg-[#24499f]/10 dark:bg-[#a3c6ff]/15 ring-[#24499f]/30",
  2: "text-[#1e5fc4] dark:text-[#8fb4f5] bg-[#3b82f6]/10 dark:bg-[#3a6fd4]/20 ring-[#3b82f6]/30",
  3: "text-[#5b6270] dark:text-[#b6bac4] bg-[#9ca3af]/12 dark:bg-[#8b909c]/20 ring-[#9ca3af]/35",
  4: "text-[#c02a2a] dark:text-[#f0a49e] bg-[#ef4444]/10 dark:bg-[#c93a32]/20 ring-[#ef4444]/30",
  5: "text-[#8f1a1a] dark:text-[#ff9b91] bg-[#a81f1f]/10 dark:bg-[#ff9b91]/15 ring-[#a81f1f]/30",
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
  DOOR_HANGER: "Dropped a door hanger",
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

/**
 * Where a sign physically stands.
 *
 * This is not decoration. Each of these carries a different removal deadline
 * and a different set of placement rules, and getting it wrong is what leaves a
 * campaign explaining itself to a by-law officer. The consequences live in
 * src/lib/sign-placement.ts; this is only the vocabulary.
 */
export const SIGN_PLACEMENTS = {
  PRIVATE_LAWN: "Private property — lawn",
  PRIVATE_COMMERCIAL: "Private property — business or farm",
  MUNICIPAL_ROW: "Municipal road allowance / boulevard",
  MTO_HIGHWAY: "Provincial highway right-of-way (MTO)",
  OTHER_PUBLIC: "Other public property",
} as const;
export type SignPlacement = keyof typeof SIGN_PLACEMENTS;
export const SIGN_PLACEMENT_OPTIONS = options(SIGN_PLACEMENTS);

/**
 * Placements with no civic address, where the run sheet has to fall back to a
 * landmark and a set of coordinates.
 *
 * A readonly tuple rather than a plain array so the member type is the three
 * placements themselves, not the whole SignPlacement union — anything keyed by
 * "a roadside placement" should fail to compile if it forgets one.
 */
export const ROADSIDE_PLACEMENTS = [
  "MUNICIPAL_ROW",
  "MTO_HIGHWAY",
  "OTHER_PUBLIC",
] as const satisfies readonly SignPlacement[];

export type RoadsidePlacement = (typeof ROADSIDE_PLACEMENTS)[number];

/** Narrows the String column off a SignRequest row to a roadside placement. */
export function isRoadside(placement: string): placement is RoadsidePlacement {
  return (ROADSIDE_PLACEMENTS as readonly string[]).includes(placement);
}

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

/* -------------------------------------------------------------------- social */

/**
 * What a post is for.
 *
 * A campaign feed that is all "vote for me" is ignored by the third week, so
 * the plan draws from a mix and the labels are the plain-language version a
 * candidate would use talking to their sister.
 */
export const POST_KINDS = {
  INTRODUCTION: "Who I am",
  DOOR_KNOCKING: "At the doors",
  POLICY: "Where I stand",
  ENDORSEMENT: "What people are saying",
  EVENT: "Come and meet me",
  ASK: "Volunteers and donations",
  GOTV: "Get out and vote",
  THANK_YOU: "Thank you",
  UPDATE: "General update",
} as const;
export type PostKind = keyof typeof POST_KINDS;
export const POST_KIND_OPTIONS = options(POST_KINDS);
export const POST_KIND_KEYS = Object.keys(POST_KINDS) as PostKind[];

/**
 * Where a post has got to.
 *
 * SUGGESTED is the plan's own writing, untouched. It is kept distinct from
 * DRAFT so the page can show at a glance how much of the schedule is still
 * boilerplate nobody has read.
 */
export const POST_STATUSES = {
  SUGGESTED: "Suggested",
  DRAFT: "Draft",
  APPROVED: "Ready to post",
  PUBLISHED: "Posted",
  FAILED: "Failed",
  SKIPPED: "Skipped",
} as const;
export type PostStatus = keyof typeof POST_STATUSES;
export const POST_STATUS_OPTIONS = options(POST_STATUSES);

/** Statuses that still expect something to happen. */
export const OPEN_POST_STATUSES: PostStatus[] = ["SUGGESTED", "DRAFT", "APPROVED"];

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
