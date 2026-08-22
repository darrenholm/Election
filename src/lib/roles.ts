/**
 * Roles, kept apart from src/lib/auth.ts so that client components can import
 * the labels without dragging `next/headers` into the browser bundle.
 */

export const ROLES = {
  OWNER: "Candidate — full control including finance",
  MANAGER: "Manager — everything except deleting the campaign",
  CANVASSER: "Canvasser — voters and canvassing only",
  VIEWER: "Read only",
} as const;

export type Role = keyof typeof ROLES;

export const ROLE_KEYS = Object.keys(ROLES) as Role[];

export const ROLE_OPTIONS = ROLE_KEYS.map((value) => ({ value, label: ROLES[value] }));

/** Ranked most to least powerful, for comparisons. */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  MANAGER: 2,
  CANVASSER: 1,
  VIEWER: 0,
};
