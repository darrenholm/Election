import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { redirect } from "next/navigation";
import {
  ROADSIDE_PLACEMENTS,
  SIGN_PLACEMENTS,
  SIGN_TYPES,
  isRoadside,
  label,
  type RoadsidePlacement,
} from "@/lib/enums";
import { formatDate, formatDateTime } from "@/lib/dates";
import { removalUrgency, removalWindowLabel } from "@/lib/sign-placement";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

/**
 * A sheet for the sign crew to take in the truck.
 *
 * Two modes. Installing works from the queue of approved requests and groups by
 * ward or street, because those signs are going to addresses. Retrieving works
 * from everything still standing and groups differently: the deadline decides
 * the order, because a sign on a highway right-of-way has three working days
 * while the one on a lawn down the road has seventy-two hours, and a crew that
 * drives the list alphabetically will collect them in exactly the wrong order.
 *
 * Roadside signs have no civic address at all, so they group by their placement
 * and print their landmark and coordinates instead. Styled to print cleanly —
 * the app chrome is hidden by the no-print rules.
 */
export default async function RunSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode = "install" } = await searchParams;
  const retrieving = mode === "retrieve";

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const signs = await db.signRequest.findMany({
    where: {
      campaignId: campaign.id,
      ...(retrieving
        ? { status: { in: ["INSTALLED", "NEEDS_REPAIR"] } }
        : { status: { in: ["APPROVED", "SCHEDULED"] } }),
    },
    orderBy: [{ ward: "asc" }, { addressLine: "asc" }],
  });

  const groups = new Map<string, typeof signs>();
  for (const sign of signs) {
    const key = groupKeyFor(sign, { usesWards: campaign.municipality.usesWards });
    const list = groups.get(key);
    if (list) list.push(sign);
    else groups.set(key, [sign]);
  }

  const sections = Array.from(groups.entries())
    .map(([name, items]) => ({
      name,
      // Sorted inline rather than through a helper so the row keeps its full
      // type. Roadside groups are left in the order the query gave them —
      // most recently placed first, roughly the order the crew drove it —
      // because there is nothing sensible to sort a stretch of highway by.
      items:
        ROADSIDE_GROUP_NAMES.has(name) || campaign.municipality.usesWards
          ? items
          : [...items].sort(byCivicNumber),
      // Roadside groups sort to the top of a retrieval sheet: they are the ones
      // on a clock, and the ones a crew is most likely to forget.
      priority: ROADSIDE_GROUP_NAMES.has(name) ? 0 : 1,
    }))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  const total = signs.reduce((n, s) => n + s.quantity, 0);
  const overdue = retrieving
    ? signs.filter((s) => removalUrgency(s.removalDueAt) === "overdue").length
    : 0;

  return (
    <>
      <PageHeader
        title={retrieving ? "Sign retrieval sheet" : "Sign install run sheet"}
        subtitle={`${total} signs across ${signs.length} stops · ${campaign.candidateName || "campaign"} · printed ${formatDate(new Date())}`}
        actions={
          <>
            <Link href="/signs" className="btn-secondary">
              Sign board
            </Link>
            <Link href="/signs/roadside" className="btn-secondary">
              Roadside
            </Link>
            <Link
              href={retrieving ? "/signs/run-sheet" : "/signs/run-sheet?mode=retrieve"}
              className="btn-secondary"
            >
              {retrieving ? "Install sheet" : "Retrieval sheet"}
            </Link>
          </>
        }
      />

      {retrieving ? (
        <div className="mb-6 space-y-2 text-sm no-print">
          <p className="text-muted">
            Work the roadside groups first — they are on the tightest clock and the
            easiest to drive past. Mark each one Removed on the board when it is in
            the truck.
          </p>
          {overdue > 0 ? (
            <p className="font-semibold text-accent-ink">
              {overdue} sign{overdue === 1 ? " is" : "s are"} already past the removal
              deadline.
            </p>
          ) : null}
        </div>
      ) : null}

      {signs.length === 0 ? (
        <Card>
          <EmptyState
            title={retrieving ? "No signs are up" : "Nothing waiting to be installed"}
            hint={
              retrieving
                ? "Nothing to collect."
                : "Approve a request on the sign board and it appears here."
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <Card
              key={section.name}
              title={section.name}
              description={`${section.items.length} stops`}
            >
              <ul className="divide-y divide-line">
                {section.items.map((sign) => {
                  const roadside = isRoadside(sign.placement);
                  const urgency = removalUrgency(sign.removalDueAt);
                  return (
                    <li key={sign.id} className="flex gap-3 py-3">
                      <span
                        aria-hidden
                        className="mt-0.5 size-5 shrink-0 rounded border-2 border-line"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {roadside
                            ? sign.landmark || "No landmark recorded"
                            : `${sign.addressLine || "No address"}${sign.city ? `, ${sign.city}` : ""}${sign.postalCode ? ` ${sign.postalCode}` : ""}`}
                        </p>

                        {roadside ? (
                          sign.latitude != null && sign.longitude != null ? (
                            <p className="text-sm text-muted">
                              {sign.latitude.toFixed(5)}, {sign.longitude.toFixed(5)}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-accent-ink">
                              No position recorded — ask whoever placed it
                            </p>
                          )
                        ) : (
                          <p className="text-sm text-muted">
                            {sign.requesterName || "—"}
                            {sign.phone ? ` · ${sign.phone}` : ""}
                          </p>
                        )}

                        <p className="text-sm">
                          {sign.quantity} × {label(SIGN_TYPES, sign.signType)}
                          {sign.signNumber ? ` · sign #${sign.signNumber}` : ""}
                        </p>

                        {retrieving && sign.removalDueAt ? (
                          <p
                            className={`text-sm ${urgency === "overdue" || urgency === "due" ? "font-semibold text-accent-ink" : "text-muted"}`}
                          >
                            {urgency === "overdue" ? "OVERDUE — " : "Down by "}
                            {formatDateTime(sign.removalDueAt)}
                          </p>
                        ) : null}

                        {!retrieving && !sign.permissionConfirmed ? (
                          <p className="text-sm font-semibold text-accent-ink">
                            Confirm permission before installing
                          </p>
                        ) : null}

                        {sign.permissionFrom ? (
                          <p className="text-sm text-muted">
                            Permission: {sign.permissionFrom}
                            {sign.permissionPhone ? ` · ${sign.permissionPhone}` : ""}
                          </p>
                        ) : null}

                        {sign.notes ? <p className="text-sm text-muted">{sign.notes}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- grouping --- */

/** The deadline that belongs in each roadside group's heading. */
const REMOVAL_NOTE: Record<RoadsidePlacement, string> = {
  MUNICIPAL_ROW: removalWindowLabel("MUNICIPAL_ROW"),
  MTO_HIGHWAY: removalWindowLabel("MTO_HIGHWAY"),
  OTHER_PUBLIC: removalWindowLabel("OTHER_PUBLIC"),
};

function roadsideGroupName(placement: RoadsidePlacement): string {
  return `${SIGN_PLACEMENTS[placement]} — ${REMOVAL_NOTE[placement]}`;
}

/** Group headings that describe a stretch of road rather than a neighbourhood. */
const ROADSIDE_GROUP_NAMES = new Set(ROADSIDE_PLACEMENTS.map(roadsideGroupName));

function groupKeyFor(
  sign: { ward: string; addressLine: string; placement: string },
  { usesWards }: { usesWards: boolean },
): string {
  // A roadside sign has no address to group on, and its deadline is the thing
  // that matters, so it is grouped by the ground it stands on instead.
  if (isRoadside(sign.placement)) return roadsideGroupName(sign.placement);
  if (usesWards) return sign.ward || "Unassigned ward";
  // Addresses arrive from the voters' list in caps; a printed sheet reads
  // better in title case.
  return titleCase(streetOf(sign.addressLine));
}

/** "12 Kent St W" → "Kent St W"; falls back to the whole line when there is no
 *  leading civic number to strip. */
function streetOf(addressLine: string): string {
  const trimmed = addressLine.trim();
  if (trimmed === "") return "No address";
  const withoutNumber = trimmed.replace(/^\d+[A-Za-z]?\s+/, "");
  return withoutNumber === "" ? trimmed : withoutNumber;
}

function civicNumber(addressLine: string): number {
  const match = addressLine.trim().match(/^(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function byCivicNumber(
  a: { addressLine: string },
  b: { addressLine: string },
): number {
  const diff = civicNumber(a.addressLine) - civicNumber(b.addressLine);
  return diff !== 0 && Number.isFinite(diff)
    ? diff
    : a.addressLine.localeCompare(b.addressLine);
}
