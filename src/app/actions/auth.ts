"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, createSessionToken } from "@/lib/session";
import { ACTIVE_CAMPAIGN_COOKIE } from "@/lib/campaign";
import { str } from "@/lib/form";

/** Only allow relative in-app destinations, so ?next= cannot bounce off-site. */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function startSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId), SESSION_COOKIE_OPTIONS);
  // The previous user's campaign choice must not carry over.
  jar.delete(ACTIVE_CAMPAIGN_COOKIE);
  await db.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() } });
}

export async function signIn(_prev: string | null, formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });

  // One message for every failure. Saying "no such account" tells an attacker
  // which addresses are worth guessing passwords for.
  const failure = "That email and password do not match an account.";
  if (!user || !user.isActive) {
    // Spend roughly the same time as a real verification so the response time
    // does not reveal whether the account exists.
    await verifyPassword(password, "00:00");
    return failure;
  }

  if (!(await verifyPassword(password, user.passwordHash))) return failure;

  await startSession(user.id);
  if (user.mustChangePassword) redirect("/account/password");
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_CAMPAIGN_COOKIE);
  redirect("/login");
}

/**
 * One-time creation of the first administrator. Only works while no users
 * exist, so it cannot be used to add an account later.
 */
export async function completeSetup(_prev: string | null, formData: FormData) {
  if (!(await needsSetup())) return "Setup has already been completed.";

  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return "Enter a valid email address.";
  const weak = checkPasswordStrength(password);
  if (weak) return weak;

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      isAdmin: true,
    },
  });

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect("/campaigns");
}

export async function changeOwnPassword(_prev: string | null, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const row = await db.user.findUnique({ where: { id: user.id } });
  if (!row) redirect("/login");

  // Someone on a forced change is proving they hold the temporary password, so
  // the current one is still required — it is what they were given.
  if (!(await verifyPassword(current, row.passwordHash))) {
    return "Your current password is not right.";
  }
  if (next !== confirm) return "The new passwords do not match.";

  const weak = checkPasswordStrength(next);
  if (weak) return weak;

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  revalidatePath("/", "layout");
  redirect("/");
}
