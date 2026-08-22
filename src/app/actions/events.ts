"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EVENT_TYPES } from "@/lib/enums";
import { bool, centsOrNull, date, intOrNull, oneOf, str } from "@/lib/form";

function eventFields(formData: FormData) {
  const startsAt = date(formData, "startsAt") ?? new Date();
  const type = oneOf(formData, "type", EVENT_TYPES, "MEET_GREET");

  return {
    name: str(formData, "name") || "Untitled event",
    type,
    startsAt,
    endsAt: date(formData, "endsAt"),
    location: str(formData, "location"),
    addressLine: str(formData, "addressLine"),
    description: str(formData, "description"),
    // A fundraiser is treated specially on Form 4, so the flag follows the type
    // unless it is ticked explicitly.
    isFundraiser: bool(formData, "isFundraiser") || type === "FUNDRAISER",
    ticketPriceCents: centsOrNull(formData, "ticketPrice"),
    expectedAttendance: intOrNull(formData, "expectedAttendance"),
    actualAttendance: intOrNull(formData, "actualAttendance"),
  };
}

export async function createEvent(formData: FormData) {
  const event = await db.event.create({ data: eventFields(formData) });
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${event.id}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  await db.event.update({ where: { id: eventId }, data: eventFields(formData) });
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/finance/form4");
}

export async function deleteEvent(eventId: string) {
  await db.event.delete({ where: { id: eventId } });
  revalidatePath("/events");
  redirect("/events");
}
