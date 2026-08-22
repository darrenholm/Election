import Link from "next/link";
import { db } from "@/lib/db";
import { getCampaign } from "@/lib/campaign";
import { SIGN_TYPES, label } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * A sheet for the sign crew to take in the truck: every address waiting on an
 * install, grouped by ward, with room to tick things off. Styled to print
 * cleanly — the app chrome is hidden by the no-print rules.
 */
export default async function RunSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode = "install" } = await searchParams;
  const retrieving = mode === "retrieve";

  const [campaign, signs] = await Promise.all([
    getCampaign(),
    db.signRequest.findMany({
      where: retrieving
        ? { status: { in: ["INSTALLED", "NEEDS_REPAIR"] } }
        : { status: { in: ["APPROVED", "SCHEDULED"] } },
      orderBy: [{ ward: "asc" }, { addressLine: "asc" }],
    }),
  ]);

  const byWard = new Map<string, typeof signs>();
  for (const sign of signs) {
    const key = sign.ward || "Unassigned ward";
    const list = byWard.get(key);
    if (list) list.push(sign);
    else byWard.set(key, [sign]);
  }
  const wards = Array.from(byWard.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
          {wards.map(([ward, items]) => (
            <Card key={ward} title={ward} description={`${items.length} stops`}>
              <ul className="divide-y divide-line">
                {items.map((sign) => (
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
