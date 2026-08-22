import Link from "next/link";
import { db } from "@/lib/db";
import { getCampaign, isCampaignConfigured } from "@/lib/campaign";
import { getFinanceSummary, auditContributions } from "@/lib/finance";
import { formatCentsShort } from "@/lib/money";
import { daysUntil, formatDate, formatDateTime } from "@/lib/dates";
import {
  SUPPORT_COLORS,
  SUPPORT_LEVELS,
  DEPLOYED_SIGN_STATUSES,
  PENDING_SIGN_STATUSES,
  OCCUPYING_STATUSES,
  type SupportLevel,
} from "@/lib/enums";
import { COMPLIANCE_DISCLAIMER } from "@/lib/ontario";
import { Card, LimitBar, Note, PageHeader, StatTile, EmptyState, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const campaign = await getCampaign();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [
    voterCount,
    contactableCount,
    supportGroups,
    contactsThisWeek,
    conversationsThisWeek,
    activeVolunteers,
    upcomingShifts,
    signsPending,
    signsUp,
    upcomingEvents,
    finance,
    flags,
  ] = await Promise.all([
    db.voter.count(),
    db.voter.count({ where: { doNotContact: false, movedAway: false, deceased: false } }),
    db.voter.groupBy({ by: ["supportLevel"], _count: true }),
    db.contactAttempt.count({ where: { occurredAt: { gte: weekAgo } } }),
    db.contactAttempt.count({ where: { occurredAt: { gte: weekAgo }, result: "SPOKE" } }),
    db.volunteer.count({ where: { status: "ACTIVE" } }),
    db.shift.findMany({
      where: { startsAt: { gte: now, lte: weekAhead } },
      include: { assignments: true },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.signRequest.count({ where: { status: { in: PENDING_SIGN_STATUSES } } }),
    db.signRequest.aggregate({
      where: { status: { in: DEPLOYED_SIGN_STATUSES } },
      _sum: { quantity: true },
    }),
    db.event.findMany({
      where: { startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    getFinanceSummary(),
    auditContributions(),
  ]);

  const identified = supportGroups
    .filter((g) => g.supportLevel !== null)
    .reduce((total, g) => total + g._count, 0);
  const supportByLevel = new Map(
    supportGroups
      .filter((g) => g.supportLevel !== null)
      .map((g) => [g.supportLevel as SupportLevel, g._count]),
  );
  const supporters = (supportByLevel.get(1) ?? 0) + (supportByLevel.get(2) ?? 0);

  const days = daysUntil(campaign.votingDay);
  const errorCount = flags.filter((f) => f.flags.some((x) => x.level === "error")).length;
  const warningCount = flags.length - errorCount;
  const overSpendingLimit = finance.subjectToLimitCents > finance.limits.spendingLimitCents;

  return (
    <>
      <PageHeader
        title={campaign.candidateName ? `${campaign.candidateName} for ${officeWord(campaign.office)}` : "Campaign dashboard"}
        subtitle={
          <>
            {campaign.municipality || "Set your municipality in Settings"}
            {campaign.ward ? ` · ${campaign.ward}` : ""} · Voting day{" "}
            {formatDate(campaign.votingDay)}
          </>
        }
        actions={
          <Link href="/canvass" className="btn-primary">
            Go canvassing
          </Link>
        }
      />

      {!isCampaignConfigured(campaign) ? (
        <div className="mb-6">
          <Note tone="warn">
            <strong>Finish setting up.</strong> Add the candidate name and the
            number of eligible electors in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            so the spending and self-funding limits are calculated for your race.
          </Note>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={days >= 0 ? "Days to voting day" : "Days since voting day"}
          value={Math.abs(days)}
          hint={formatDate(campaign.votingDay)}
          tone={days >= 0 && days <= 14 ? "warn" : "neutral"}
        />
        <StatTile
          label="Voters identified"
          value={identified.toLocaleString("en-CA")}
          hint={
            contactableCount > 0
              ? `${((identified / contactableCount) * 100).toFixed(1)}% of ${contactableCount.toLocaleString("en-CA")} contactable`
              : "Import a voters' list to begin"
          }
          href="/voters"
        />
        <StatTile
          label="Confirmed supporters"
          value={supporters.toLocaleString("en-CA")}
          hint="Support levels 1 and 2"
          href="/voters?support=1&support=2"
          tone="good"
        />
        <StatTile
          label="Contacts this week"
          value={contactsThisWeek.toLocaleString("en-CA")}
          hint={`${conversationsThisWeek.toLocaleString("en-CA")} real conversations`}
          href="/canvass"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Voter identification"
            description={`${voterCount.toLocaleString("en-CA")} people on file`}
            actions={
              <Link href="/voters" className="btn-secondary">
                Open voter file
              </Link>
            }
          >
            {identified === 0 ? (
              <EmptyState
                title="No voters identified yet"
                hint="Import your municipal voters' list, then start recording support levels at the door."
                action={
                  <Link href="/voters/import" className="btn-primary">
                    Import voters
                  </Link>
                }
              />
            ) : (
              <SupportBreakdown byLevel={supportByLevel} total={identified} />
            )}
          </Card>

          <Card
            title="Upcoming shifts"
            description="Next seven days"
            actions={
              <Link href="/shifts" className="btn-secondary">
                All shifts
              </Link>
            }
          >
            {upcomingShifts.length === 0 ? (
              <EmptyState
                title="Nothing scheduled this week"
                hint="Put canvass blocks and phone banks on the calendar so volunteers have something to sign up for."
                action={
                  <Link href="/shifts" className="btn-primary">
                    Schedule a shift
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {upcomingShifts.map((shift) => {
                  const filled = shift.assignments.filter((a) =>
                    OCCUPYING_STATUSES.includes(a.status as never),
                  ).length;
                  const short = shift.capacity > 0 && filled < shift.capacity;
                  return (
                    <li key={shift.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/shifts/${shift.id}`} className="font-medium hover:underline">
                          {shift.title}
                        </Link>
                        <p className="text-xs text-muted">
                          {formatDateTime(shift.startsAt)}
                          {shift.location ? ` · ${shift.location}` : ""}
                        </p>
                      </div>
                      <Badge tone={short ? "warn" : "good"}>
                        {shift.capacity > 0 ? `${filled}/${shift.capacity}` : `${filled} signed up`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Money"
            description={COMPLIANCE_DISCLAIMER}
            actions={
              <Link href="/finance" className="btn-secondary">
                Finance
              </Link>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Raised
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">
                    {formatCentsShort(finance.totalContributionsCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    On hand
                  </p>
                  <p
                    className={`mt-0.5 text-xl font-bold tabular-nums ${
                      finance.balanceCents < 0 ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {formatCentsShort(finance.balanceCents)}
                  </p>
                </div>
              </div>

              <LimitBar
                label="Spending against limit"
                value={finance.subjectToLimitCents}
                limit={finance.limits.spendingLimitCents}
                valueLabel={formatCentsShort(finance.subjectToLimitCents)}
                limitLabel={formatCentsShort(finance.limits.spendingLimitCents)}
              />

              {overSpendingLimit ? (
                <Note tone="bad">
                  Spending subject to the limit has passed the limit. Over-spending
                  is an offence under the Act — stop committing new expenses and
                  speak to your auditor.
                </Note>
              ) : null}

              {errorCount + warningCount > 0 ? (
                <Link
                  href="/finance"
                  className={`block rounded-lg border px-3 py-2 text-xs ${
                    errorCount > 0
                      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  }`}
                >
                  {errorCount > 0 ? (
                    <strong>
                      {errorCount} contribution{errorCount === 1 ? "" : "s"} need
                      attention
                    </strong>
                  ) : (
                    <strong>
                      {warningCount} bookkeeping item{warningCount === 1 ? "" : "s"} outstanding
                    </strong>
                  )}
                  <span className="block">Review on the finance page →</span>
                </Link>
              ) : (
                <Note>No compliance problems found in the contributions on file.</Note>
              )}
            </div>
          </Card>

          <Card
            title="Lawn signs"
            actions={
              <Link href="/signs" className="btn-secondary">
                Sign board
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Waiting on crew"
                value={signsPending}
                tone={signsPending > 0 ? "warn" : "neutral"}
              />
              <StatTile label="Signs up" value={signsUp._sum.quantity ?? 0} tone="good" />
            </div>
          </Card>

          <Card
            title="Volunteers"
            actions={
              <Link href="/volunteers" className="btn-secondary">
                Roster
              </Link>
            }
          >
            <p className="text-2xl font-bold tabular-nums">{activeVolunteers}</p>
            <p className="text-xs text-muted">active volunteers</p>
          </Card>

          {upcomingEvents.length > 0 ? (
            <Card title="Coming up" actions={<Link href="/events" className="btn-secondary">Events</Link>}>
              <ul className="space-y-2">
                {upcomingEvents.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Link href="/events" className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    <p className="text-xs text-muted">{formatDateTime(e.startsAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function SupportBreakdown({
  byLevel,
  total,
}: {
  byLevel: Map<SupportLevel, number>;
  total: number;
}) {
  const levels: SupportLevel[] = [1, 2, 3, 4, 5];

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-raise">
        {levels.map((level) => {
          const count = byLevel.get(level) ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={level}
              className={SUPPORT_COLORS[level]}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${SUPPORT_LEVELS[level]}: ${count}`}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {levels.map((level) => {
          const count = byLevel.get(level) ?? 0;
          return (
            <li key={level} className="flex items-center gap-2 text-sm">
              <span className={`size-2.5 shrink-0 rounded-full ${SUPPORT_COLORS[level]}`} />
              <span className="flex-1 truncate">{SUPPORT_LEVELS[level]}</span>
              <span className="tabular-nums font-medium">{count.toLocaleString("en-CA")}</span>
              <span className="w-12 text-right tabular-nums text-xs text-muted">
                {total > 0 ? `${((count / total) * 100).toFixed(0)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function officeWord(office: string): string {
  switch (office) {
    case "HEAD_OF_COUNCIL":
      return "Mayor";
    case "COUNCILLOR":
      return "Council";
    case "SCHOOL_TRUSTEE":
      return "Trustee";
    default:
      return "Office";
  }
}
