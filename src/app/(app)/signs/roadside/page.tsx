import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { ROADSIDE_PLACEMENTS, SIGN_PLACEMENTS, SIGN_TYPES, label } from "@/lib/enums";
import { formatDateTime } from "@/lib/dates";
import { removalUrgency, URGENCY_TONE } from "@/lib/sign-placement";
import { Badge, Card, EmptyState, Note, PageHeader, StatTile } from "@/components/ui";
import { RoadsideForm } from "@/components/roadside-form";

export const dynamic = "force-dynamic";

/**
 * Roadside signs: the ones nobody asked for.
 *
 * The main sign board is built around a request — a resident wants a sign, it
 * goes on their lawn, and their address is how the crew finds it again. A sign
 * on a concession road has none of that. It has a pin, a landmark and a
 * deadline, and it is the kind that gets left behind, because nothing in the
 * app remembers it exists.
 */
export default async function RoadsidePage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const [signs, volunteers] = await Promise.all([
    db.signRequest.findMany({
      where: {
        campaignId: campaign.id,
        placement: { in: [...ROADSIDE_PLACEMENTS] },
      },
      include: {
        installedBy: { select: { firstName: true, lastName: true } },
        photos: { select: { id: true }, orderBy: { takenAt: "desc" }, take: 1 },
      },
      orderBy: [{ status: "asc" }, { installedAt: "desc" }],
    }),
    db.volunteer.findMany({
      where: { campaignId: campaign.id, status: "ACTIVE" },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const up = signs.filter((s) => s.status === "INSTALLED" || s.status === "NEEDS_REPAIR");
  const outstanding = up.reduce((n, s) => n + s.quantity, 0);
  const overdue = up.filter((s) => removalUrgency(s.removalDueAt) === "overdue").length;
  const onHighway = up.filter((s) => s.placement === "MTO_HIGHWAY").length;

  return (
    <>
      <PageHeader
        title="Roadside signs"
        subtitle={`${outstanding} out on the roads · ${campaign.candidateName || "campaign"}`}
        actions={
          <>
            <Link href="/signs" className="btn-secondary">
              Sign board
            </Link>
            <Link href="/signs/run-sheet?mode=retrieve" className="btn-primary">
              Retrieval sheet
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatTile label="Out on the roads" value={outstanding} />
        <StatTile
          label="Past their deadline"
          value={overdue}
          tone={overdue > 0 ? "bad" : "neutral"}
          hint={overdue > 0 ? "Take these down first" : "Nothing overdue"}
        />
        <StatTile
          label="On highway right-of-way"
          value={onHighway}
          hint="MTO gives 3 working days"
          tone={onHighway > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RoadsideForm volunteers={volunteers} />

        <div className="space-y-4">
          <Note>
            Sign rules are set by each municipality, and the by-law is the thing that
            governs — not this page. Read your local one before the first sign goes
            out, and confirm the removal deadline with the clerk. Signs on a
            provincial highway answer to the Ministry of Transportation instead.
          </Note>

          <Card
            title="Recorded so far"
            description={`${signs.length} roadside placement${signs.length === 1 ? "" : "s"}`}
          >
            {signs.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                hint="Record the first sign with the form beside this."
              />
            ) : (
              <ul className="divide-y divide-line">
                {signs.map((sign) => {
                  const urgency = removalUrgency(sign.removalDueAt);
                  const gone = sign.status === "REMOVED";
                  return (
                    <li key={sign.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {sign.landmark || sign.addressLine || "No landmark recorded"}
                          </p>
                          <p className="text-sm text-muted">
                            {sign.quantity} × {label(SIGN_TYPES, sign.signType)}
                            {sign.signNumber ? ` · #${sign.signNumber}` : ""}
                            {" · "}
                            {label(SIGN_PLACEMENTS, sign.placement)}
                          </p>
                          {sign.latitude != null && sign.longitude != null ? (
                            <p className="text-xs text-muted">
                              {sign.latitude.toFixed(5)}, {sign.longitude.toFixed(5)}
                            </p>
                          ) : (
                            <p className="text-xs text-accent-ink">No position recorded</p>
                          )}
                          {sign.installedBy ? (
                            <p className="text-xs text-muted">
                              Placed by {sign.installedBy.firstName} {sign.installedBy.lastName}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {gone ? (
                            <Badge tone="neutral">Removed</Badge>
                          ) : (
                            <Badge tone={URGENCY_TONE[urgency]}>
                              {urgency === "overdue"
                                ? "Overdue"
                                : urgency === "due"
                                  ? "Due now"
                                  : "Up"}
                            </Badge>
                          )}
                          {sign.photos.length > 0 ? (
                            <a
                              href={`/api/sign-photos/${sign.photos[0].id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs underline"
                            >
                              Photo
                            </a>
                          ) : null}
                        </div>
                      </div>

                      {!gone && sign.removalDueAt ? (
                        <p className="mt-1 text-xs text-muted">
                          Down by {formatDateTime(sign.removalDueAt)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
