"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { type Role } from "@/lib/roles";
import { checkPasswordStrength, hashPassword, temporaryPassword } from "@/lib/password";
import { ROLE_KEYS } from "@/lib/roles";
import { bool, str } from "@/lib/form";

/**
 * Managing who can reach what.
 *
 * Every action here re-checks that the caller is an administrator. A server
 * action is a public endpoint: hiding the page is not access control, and a
 * candidate who worked out the action's name could otherwise grant themselves
 * a rival's campaign.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) throw new Error("Administrators only");
  return user;
}

export type CreatedUser = { email: string; password: string } | { error: string };

/**
 * Create an account with a temporary password, shown once. There is no email
 * sending in this app, so the password is read out and the account is forced to
 * change it at first sign-in.
 */
export async function createTeamMember(
  _prev: CreatedUser | null,
  formData: FormData,
): Promise<CreatedUser> {
  await requireAdmin();

  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  if (!email.includes("@")) return { error: "Enter a valid email address." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const password = temporaryPassword();
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      isAdmin: bool(formData, "isAdmin"),
      mustChangePassword: true,
    },
  });

  const campaignId = str(formData, "campaignId");
  const role = str(formData, "role") as Role;
  if (campaignId && ROLE_KEYS.includes(role)) {
    await db.campaignAccess.create({ data: { userId: user.id, campaignId, role } });
  }

  revalidatePath("/team");
  return { email, password };
}

export async function grantAccess(formData: FormData) {
  await requireAdmin();

  const userId = str(formData, "userId");
  const campaignId = str(formData, "campaignId");
  const role = str(formData, "role") as Role;
  if (!userId || !campaignId || !ROLE_KEYS.includes(role)) return;

  await db.campaignAccess.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: { userId, campaignId, role },
    update: { role },
  });

  revalidatePath("/team");
}

export async function revokeAccess(accessId: string) {
  await requireAdmin();
  await db.campaignAccess.delete({ where: { id: accessId } });
  revalidatePath("/team");
}

export async function setUserActive(userId: string, isActive: boolean) {
  const admin = await requireAdmin();
  // Locking yourself out would leave nobody able to unlock anything.
  if (userId === admin.id && !isActive) return;

  await db.user.update({ where: { id: userId }, data: { isActive } });
  revalidatePath("/team");
}

/** Issue a fresh temporary password for someone who has forgotten theirs. */
export async function resetPassword(
  _prev: CreatedUser | null,
  formData: FormData,
): Promise<CreatedUser> {
  await requireAdmin();

  const userId = str(formData, "userId");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "That account no longer exists." };

  const password = temporaryPassword();
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });

  revalidatePath("/team");
  return { email: user.email, password };
}

/** Set a specific password, for an administrator who would rather choose one. */
export async function setPassword(formData: FormData) {
  await requireAdmin();

  const userId = str(formData, "userId");
  const password = String(formData.get("password") ?? "");
  if (checkPasswordStrength(password)) return;

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  revalidatePath("/team");
}
