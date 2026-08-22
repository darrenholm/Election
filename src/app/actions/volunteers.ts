"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  ASSIGNMENT_STATUSES,
  SHIFT_TYPES,
  VOLUNTEER_STATUSES,
  joinList,
} from "@/lib/enums";
import { bool, date, int, list, oneOf, str, strOrNull } from "@/lib/form";
import { requireCampaignId } from "@/lib/campaign";

/* -------------------------------------------------------------- volunteers */

function volunteerFields(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    status: oneOf(formData, "status", VOLUNTEER_STATUSES, "ACTIVE"),
    roles: joinList(list(formData, "roles")),
    availability: str(formData, "availability"),
    hasVehicle: bool(formData, "hasVehicle"),
    notes: str(formData, "notes"),
  };
}

export async function createVolunteer(formData: FormData) {
  const campaignId = await requireCampaignId();
  const volunteer = await db.volunteer.create({
    data: {
      ...volunteerFields(formData),
      campaignId,
      voterId: strOrNull(formData, "voterId"),
    },
  });
  revalidatePath("/volunteers");
  redirect(`/volunteers/${volunteer.id}`);
}

export async function updateVolunteer(volunteerId: string, formData: FormData) {
  await db.volunteer.update({
    where: { id: volunteerId },
    data: volunteerFields(formData),
  });
  revalidatePath("/volunteers");
  revalidatePath(`/volunteers/${volunteerId}`);
}

export async function deleteVolunteer(volunteerId: string) {
  await db.volunteer.delete({ where: { id: volunteerId } });
  revalidatePath("/volunteers");
  redirect("/volunteers");
}

/**
 * Promote a voter who offered to help into the volunteer roster, carrying
 * their contact details across and linking the two records.
 */
export async function recruitVoter(voterId: string) {
  const campaignId = await requireCampaignId();
  const voter = await db.voter.findUnique({
    where: { id: voterId },
    include: { volunteers: { where: { campaignId } } },
  });
  if (!voter) return;
  // Someone can volunteer for two candidates; only this campaign's roster matters.
  if (voter.volunteers.length > 0) {
    redirect(`/volunteers/${voter.volunteers[0].id}`);
  }

  const volunteer = await db.volunteer.create({
    data: {
      campaignId,
      firstName: voter.firstName,
      lastName: voter.lastName,
      email: voter.email,
      phone: voter.phone,
      status: "PROSPECT",
      voterId: voter.id,
      notes: "Offered to volunteer while being canvassed.",
    },
  });

  revalidatePath("/volunteers");
  redirect(`/volunteers/${volunteer.id}`);
}

/* ------------------------------------------------------------------ shifts */

function shiftFields(formData: FormData) {
  const startsAt = date(formData, "startsAt") ?? new Date();
  // A shift with no end time defaults to two hours, the length of a normal
  // canvass block.
  const endsAt = date(formData, "endsAt") ?? new Date(startsAt.getTime() + 2 * 3_600_000);

  return {
    title: str(formData, "title") || "Untitled shift",
    type: oneOf(formData, "type", SHIFT_TYPES, "CANVASS"),
    startsAt,
    endsAt: endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + 2 * 3_600_000),
    location: str(formData, "location"),
    capacity: Math.max(0, int(formData, "capacity")),
    notes: str(formData, "notes"),
    eventId: strOrNull(formData, "eventId"),
  };
}

export async function createShift(formData: FormData) {
  const campaignId = await requireCampaignId();
  const shift = await db.shift.create({
    data: { ...shiftFields(formData), campaignId },
  });
  revalidatePath("/shifts");
  revalidatePath("/");
  redirect(`/shifts/${shift.id}`);
}

export async function updateShift(shiftId: string, formData: FormData) {
  await db.shift.update({ where: { id: shiftId }, data: shiftFields(formData) });
  revalidatePath("/shifts");
  revalidatePath(`/shifts/${shiftId}`);
}

export async function deleteShift(shiftId: string) {
  await db.shift.delete({ where: { id: shiftId } });
  revalidatePath("/shifts");
  redirect("/shifts");
}

/* ------------------------------------------------------------- assignments */

export async function assignVolunteer(shiftId: string, formData: FormData) {
  const volunteerId = str(formData, "volunteerId");
  if (!volunteerId) return;

  // Signing the same person up twice is a slip, not an error worth showing —
  // upsert leaves the existing assignment (and its check-in) alone.
  await db.shiftAssignment.upsert({
    where: { shiftId_volunteerId: { shiftId, volunteerId } },
    create: { shiftId, volunteerId, status: "SIGNED_UP" },
    update: {},
  });

  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  revalidatePath("/");
}

export async function setAssignmentStatus(assignmentId: string, formData: FormData) {
  const status = oneOf(formData, "status", ASSIGNMENT_STATUSES, "SIGNED_UP");
  const assignment = await db.shiftAssignment.update({
    where: { id: assignmentId },
    data: {
      status,
      // Checking in stamps the time; any other status clears it so hours are
      // never counted for someone who did not turn up.
      checkedInAt: status === "CHECKED_IN" ? new Date() : null,
    },
  });

  revalidatePath(`/shifts/${assignment.shiftId}`);
  revalidatePath(`/volunteers/${assignment.volunteerId}`);
}

export async function logHours(assignmentId: string, formData: FormData) {
  const hours = Number(str(formData, "hours"));
  const assignment = await db.shiftAssignment.update({
    where: { id: assignmentId },
    data: {
      hoursLogged: Number.isFinite(hours) && hours > 0 ? hours : null,
      notes: str(formData, "notes"),
    },
  });

  revalidatePath(`/shifts/${assignment.shiftId}`);
  revalidatePath(`/volunteers/${assignment.volunteerId}`);
}

export async function removeAssignment(assignmentId: string) {
  const assignment = await db.shiftAssignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/shifts/${assignment.shiftId}`);
  revalidatePath("/shifts");
}
