import { POST_KINDS, splitList, type PostKind } from "./enums";
import { formatDate } from "./dates";

/**
 * Turning a cadence into a dated list of posts.
 *
 * What actually goes wrong on a small campaign is not the writing. It is that
 * nobody posts for eleven days in the middle of September, and then panics in
 * the last week. So the plan is the thing the candidate sets up — how often,
 * which days, when to step it up — and the app answers with the whole schedule
 * laid out, each slot already carrying a draft to argue with. Arguing with a
 * bad draft is much easier than facing an empty box.
 *
 * Nothing here talks to Facebook or to the database: it is the arithmetic and
 * the words, kept separate so both can be read on their own.
 */

export type PlanShape = {
  daysOfWeek: string;
  timeOfDay: string;
  rampWeeks: number;
  rampDaysOfWeek: string;
  startsOn: Date;
  endsOn: Date;
  mix: string;
};

export type CampaignShape = {
  candidateName: string;
  office: string;
  ward: string;
  votingDay: Date;
  municipality: { name: string };
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** ISO weekday, 1 = Monday, from a Date's Sunday-first getDay(). */
function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function weekdayNumbers(list: string): number[] {
  return splitList(list)
    .map((value) => Number(value))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);
}

function namedDays(list: string): string {
  const days = weekdayNumbers(list).map((n) => WEEKDAY_NAMES[n - 1]);
  if (days.length === 0) return "no days";
  if (days.length === 7) return "every day";
  if (days.length === 1) return days[0] + "s";
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/** "17:00" as the hour and minute to stamp on a slot. */
function timeParts(timeOfDay: string): { hours: number; minutes: number } {
  const [rawHours, rawMinutes] = timeOfDay.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  return {
    hours: Number.isInteger(hours) && hours >= 0 && hours <= 23 ? hours : 17,
    minutes: Number.isInteger(minutes) && minutes >= 0 && minutes <= 59 ? minutes : 0,
  };
}

function prettyTime(timeOfDay: string): string {
  const { hours, minutes } = timeParts(timeOfDay);
  const suffix = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minutes).padStart(2, "0")}${suffix}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export type Slot = { scheduledFor: Date; kind: PostKind };

/**
 * Every slot the plan calls for, from `from` (today, normally) to the end.
 *
 * The last stretch runs on the ramp days instead of the ordinary ones, because
 * the fortnight before voting day is when a feed has to be visible and the
 * three-a-week rhythm that was right in August is not right in October.
 */
export function generateSlots(plan: PlanShape, from: Date = new Date()): Slot[] {
  const ordinary = weekdayNumbers(plan.daysOfWeek);
  const ramp = weekdayNumbers(plan.rampDaysOfWeek);
  if (ordinary.length === 0 && ramp.length === 0) return [];

  const { hours, minutes } = timeParts(plan.timeOfDay);
  const begin = startOfDay(new Date(Math.max(startOfDay(plan.startsOn).getTime(), startOfDay(from).getTime())));
  const end = startOfDay(plan.endsOn);
  if (begin > end) return [];

  const rampBegins = addDays(end, -Math.max(0, plan.rampWeeks) * 7);
  const finalWeek = addDays(end, -6);

  const mix = splitList(plan.mix).filter((kind): kind is PostKind => kind in POST_KINDS);
  const pool: PostKind[] = mix.length > 0 ? mix : (["UPDATE"] as PostKind[]);

  // Three kinds are placed rather than rotated: the introduction goes first,
  // get-out-the-vote belongs to the closing week, and a thank-you is for
  // afterwards. Leaving them in the rotation puts "voting day is October 26th"
  // in the feed in August, which reads as a campaign on autopilot.
  const RESERVED: PostKind[] = ["INTRODUCTION", "GOTV", "THANK_YOU"];
  const rotating = pool.filter((kind) => !RESERVED.includes(kind));

  const slots: Slot[] = [];
  let cursor = 0;

  for (let day = new Date(begin); day <= end; day = addDays(day, 1)) {
    const inRamp = day >= rampBegins;
    const days = inRamp && ramp.length > 0 ? ramp : ordinary;
    if (!days.includes(isoWeekday(day))) continue;

    const scheduledFor = new Date(day);
    scheduledFor.setHours(hours, minutes, 0, 0);

    // The closing week is about turnout and nothing else, and the very first
    // post of a plan should say who this is.
    let kind: PostKind;
    if (slots.length === 0 && pool.includes("INTRODUCTION")) {
      kind = "INTRODUCTION";
    } else if (day >= finalWeek && pool.includes("GOTV")) {
      kind = "GOTV";
    } else if (rotating.length > 0) {
      kind = rotating[cursor % rotating.length];
      cursor += 1;
    } else {
      kind = pool[cursor % pool.length];
      cursor += 1;
    }

    slots.push({ scheduledFor, kind });
  }

  return slots;
}

/**
 * The cadence in a sentence, for the top of the page. This is the "how often"
 * the candidate agreed to, said back to them in words rather than as a form
 * they have to re-read.
 */
export function describeCadence(plan: PlanShape, slotCount: number): string {
  const ordinaryCount = weekdayNumbers(plan.daysOfWeek).length;
  const rampCount = weekdayNumbers(plan.rampDaysOfWeek).length;

  const base = `${ordinaryCount} ${ordinaryCount === 1 ? "post" : "posts"} a week — ${namedDays(
    plan.daysOfWeek,
  )} at ${prettyTime(plan.timeOfDay)}`;

  const ramp =
    plan.rampWeeks > 0 && rampCount > ordinaryCount
      ? `, stepping up to ${rampCount} a week for the last ${
          plan.rampWeeks === 1 ? "week" : `${plan.rampWeeks} weeks`
        }`
      : "";

  return `${base}${ramp}. That is ${slotCount} ${
    slotCount === 1 ? "post" : "posts"
  } between now and ${formatDate(plan.endsOn)}.`;
}

/**
 * A starter draft for one slot.
 *
 * Deliberately unfinished. Every one of these has a blank in it the candidate
 * has to fill — a name, a street, a reason — because a post that reads like it
 * came out of a machine is worse than no post, and the fastest way to stop
 * someone shipping boilerplate is to make the boilerplate obviously unfinished.
 */
export function starterBody(kind: PostKind, campaign: CampaignShape): string {
  const name = campaign.candidateName || "the candidate";
  const town = campaign.municipality.name;
  const votingDay = formatDate(campaign.votingDay);
  const seat = campaign.ward ? `${campaign.ward}` : town;

  switch (kind) {
    case "INTRODUCTION":
      return `I'm ${name}, and I'm running in ${seat} this fall.\n\nI've lived here for [how long], and I'm running because [the one thing that made you decide]. Over the next few months I'll be knocking on as many doors as I can — if I miss yours, tell me here.\n\nVoting day is ${votingDay}.`;
    case "DOOR_KNOCKING":
      return `Out on [street] this evening.\n\n[What someone said that stuck with you — a worry, a question, something they wanted council to know.]\n\nThat's the part of this I'll miss when it's over. If you're on [neighbourhood] and I haven't got to you yet, I'm coming.`;
    case "POLICY":
      return `Where I stand on [the issue].\n\n[What you would actually do, in two or three sentences. Not "I'll look into it" — the thing you would vote for.]\n\n[What it would cost, or what it would take. People can tell when a promise has no price on it.]`;
    case "ENDORSEMENT":
      return `"[What they said about you, in their words.]"\n\n— [Name], [what makes them worth listening to: a neighbour on X street, a coach, a business owner]\n\nGrateful for this one.`;
    case "EVENT":
      return `Come and say hello.\n\n[What it is] — [date], [time], [place].\n\nNo speeches. Bring the thing you'd want to raise at council, and I'll tell you honestly whether I can do anything about it.`;
    case "ASK":
      return `This campaign runs on people, not money — but it needs a bit of both.\n\nIf you can spare a Saturday morning to knock doors, or take a sign for your lawn, reply here or call [number]. Contributions go through [how], and every one gets a receipt.\n\nThank you to everyone who has already put their hand up.`;
    case "GOTV":
      return `Voting day is ${votingDay}.\n\n[Where to vote, and the hours. Check the ${town} clerk's page and put the real details here.]\n\nBring ID. It takes about five minutes. If you need a lift, message me — we'll sort one out.`;
    case "THANK_YOU":
      return `Thank you, ${town}.\n\n[Whatever the result was, say it plainly.]\n\n[Who to thank by name: the volunteers, the people who took a sign, the person who fed everyone on the last weekend.]`;
    case "UPDATE":
    default:
      return `[What's happened this week on the campaign.]\n\n[One specific thing — a number, a place, a conversation. "Great day out today" is not a post.]`;
  }
}

/** Sensible opening settings for a campaign that has not planned anything yet. */
export function planDefaults(campaign: CampaignShape, campaignPeriodStart: Date): PlanShape {
  const today = startOfDay(new Date());
  const start = startOfDay(campaignPeriodStart);

  return {
    daysOfWeek: "1,3,5",
    timeOfDay: "17:00",
    rampWeeks: 2,
    rampDaysOfWeek: "1,2,3,4,5,6",
    startsOn: start > today ? start : today,
    endsOn: startOfDay(campaign.votingDay),
    mix: "INTRODUCTION,DOOR_KNOCKING,POLICY,ENDORSEMENT,EVENT,ASK,GOTV",
  };
}
