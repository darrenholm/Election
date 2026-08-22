import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { redirect } from "next/navigation";
import { SIGN_TYPES, label } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

/**
 * A sheet for the sign crew to take in the truck: every address waiting on an
 * install, with room to tick things off. Grouped by ward where the
 * municipality has them and by street where it does not, so the crew always
 * works one area at a time. Styled to print cleanly — the app chrome is hidden
 * by the no-print rules.
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
    // Addresses arrive from the voters' list in caps; a printed sheet reads
    // better in title case.
    const key = campaign.municipality.usesWards
      ? sign.ward || "Unassigned ward"
      : titleCase(streetOf(sign.addressLine));
    const list = groups.get(key);
    if (list) list.push(sign);
    else groups.set(key, [sign]);
  }

  const sections = Array.from(groups.entries())
    .map(([name, items]) => ({
      name,
      // Within a street, drive it in civic-number order rather than the
      // alphabetical order a text sort would give ("10" before "9").
      items: campaign.municipality.usesWards ? items : [...items].sort(byCivicNumber),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const total = signs.reduce((n, s) => n + s.quantity, 0);

  return (
    <>
      <PageHeader
        title={retrieving ? "Sign retrieval sheet" : "Sign install run sheet"}
        subtitle={`${total} signs across ${signs.length} addresses · ${campaign.candidateName || "campaign"} · printed ${formatDate(new Date())}`}
        actions={
          <>
            <Link href="/signs" className="btn-secondary">
              Sign board
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
        <p className="mb-6 text-sm text-muted no-print">
          Signs must come down promptly after voting day. Work this list, then
          mark each one Removed on the board.
        </p>
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
                {section.items.map((sign) => (
                  <li key={sign.id} className="flex gap-3 py-3">
                    <span
                      aria-hidden
                      className="mt-0.5 size-5 shrink-0 rounded border-2 border-line"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {sign.addressLine || "No address"}
                        {sign.city ? `, ${sign.city}` : ""}
                        {sign.postalCode ? ` ${sign.postalCode}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {sign.requesterName || "—"}
                        {sign.phone ? ` · ${sign.phone}` : ""}
                      </p>
                      <p className="text-sm">
                        {sign.quantity} × {label(SIGN_TYPES, sign.signType)}
                        {!sign.permissionConfirmed ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-300">
                            {" "}
                            — confirm permission before installing
                          </span>
                        ) : null}
                      </p>
                      {sign.notes ? <p className="text-sm text-muted">{sign.notes}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
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
