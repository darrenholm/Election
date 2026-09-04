import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { Card, EmptyState, Note, PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

/**
 * Logging somebody met away from a door.
 *
 * The arena, the main street, a ratepayers' meeting — most of a municipal
 * candidate's conversations happen nowhere near a walk list, and until now
 * there was no way to record one without inventing an address for it. The form
 * is the same one the canvass uses, so the same support level, consent,
 * endorsement, photo and follow-up all come with it, and the same offline
 * queue holds it when the arena has no signal.
 */
export default async function MeetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; voterId?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const wanted = (params.voterId ?? "").trim();

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const volunteers = await db.volunteer.findMany({
    where: { campaignId: campaign.id, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Scoped to the municipality: the person in front of you votes here or they
  // do not, and a name from another town is not a match worth offering.
  const voter = wanted
    ? await db.voter.findFirst({
        where: { id: wanted, municipalityId: campaign.municipalityId },
        include: {
          household: { select: { streetNumber: true, streetName: true } },
          campaignStates: {
            where: { campaignId: campaign.id },
            select: { smsConsent: true, phone: true, email: true },
          },
        },
      })
    : null;

  const matches =
    !voter && q.length >= 2
      ? await db.voter.findMany({
          where: {
            municipalityId: campaign.municipalityId,
            OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }],
          },
          include: { household: { select: { streetNumber: true, streetName: true } } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 12,
        })
      : [];

  const where = (v: { household: { streetNumber: string; streetName: string } | null }) =>
    v.household ? titleCase(`${v.household.streetNumber} ${v.household.streetName}`.trim()) : "";

  return (
    <>
      <PageHeader
        title={voter ? `Met ${titleCase(`${voter.firstName} ${voter.lastName}`)}` : "Met someone"}
        subtitle="Somebody you spoke to away from a door — at an event, on the street, at the rink."
        actions={
          voter ? (
            <Link href="/meet" className="btn-secondary">
              Somebody else
            </Link>
          ) : null
        }
      />

      {!voter ? (
        <Card
          title="Are they on the voters' list?"
          description="Search first — attaching the conversation to their record keeps it with everything else you know."
        >
          <form method="get" className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Surname or first name"
              className="field w-64"
              autoFocus
            />
            <button type="submit" className="btn-secondary">
              Search
            </button>
          </form>

          {q.length >= 2 ? (
            matches.length > 0 ? (
              <ul className="mt-3 divide-y divide-line">
                {matches.map((m) => (
                  <li key={m.id} className="py-2">
                    <Link
                      href={`/meet?voterId=${m.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <span className="font-medium">
                        {titleCase(`${m.firstName} ${m.lastName}`)}
                      </span>
                      <span className="text-xs text-muted">{where(m) || "No address on file"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nobody by that name"
                hint="Log them below instead — they go on the file as a new elector with no address."
              />
            )
          ) : null}
        </Card>
      ) : null}

      <div className="mt-6">
        <Card title={voter ? "What was said" : "Log the conversation"}>
          {!voter ? (
            <Note>
              Give a name and this person joins the municipal file without an address. Add one
              later from their record if you learn where they live.
            </Note>
          ) : null}
          <div className={voter ? "" : "mt-3"}>
            <ContactForm
              voterId={voter?.id ?? null}
              askForName={!voter}
              volunteers={volunteers}
              draftScope={campaign.id}
              defaultMethod="EVENT"
              knownPhone={voter?.campaignStates[0]?.phone ?? ""}
              knownEmail={voter?.campaignStates[0]?.email ?? ""}
              smsConsent={voter?.campaignStates[0]?.smsConsent ?? "UNKNOWN"}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
