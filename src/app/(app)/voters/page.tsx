import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { stateOf } from "@/lib/voter-state";
import { SUPPORT_LEVEL_OPTIONS } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SupportBadge, VoterLink, addressLine, titleCase } from "@/components/voter";
import { normaliseStreet } from "@/lib/address";
import { getActiveCampaign } from "@/lib/campaign";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = {
  q?: string;
  support?: string | string[];
  ward?: string;
  street?: string;
  flag?: string;
  page?: string;
};

/** Named slices of the file that a campaign asks for over and over. */
/**
 * Named slices of the file. Most are about what THIS campaign thinks, so they
 * filter on its VoterCampaignState row; "needs-id" is the absence of one.
 */
function flagWhere(key: string, campaignId: string): Prisma.VoterWhereInput | null {
  const state = (where: Prisma.VoterCampaignStateWhereInput): Prisma.VoterWhereInput => ({
    campaignStates: { some: { campaignId, ...where } },
  });

  switch (key) {
    case "needs-id":
      return {
        OR: [
          { campaignStates: { none: { campaignId } } },
          { campaignStates: { some: { campaignId, supportLevel: null } } },
        ],
      };
    case "supporters":
      return state({ supportLevel: { in: [1, 2] } });
    case "undecided":
      return state({ supportLevel: 3 });
    case "signs":
      return state({ wantsSign: true });
    case "volunteers":
      return state({ wantsToVolunteer: true });
    case "donors":
      return state({ isDonorProspect: true });
    case "consented":
      return state({ smsConsent: "GRANTED" });
    case "phone":
      return { NOT: { phone: "" } };
    case "dnc":
      return state({ doNotContact: true });
    default:
      return null;
  }
}

const FLAG_LABELS: Record<string, string> = {
  "needs-id": "Not yet identified",
  supporters: "Supporters (1–2)",
  undecided: "Undecided (3)",
  signs: "Wants a sign",
  volunteers: "Offered to volunteer",
  donors: "Donor prospects",
  consented: "Agreed to texts",
  phone: "Has a phone number",
  dnc: "Do not contact",
};

export default async function VotersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const ward = (params.ward ?? "").trim();
  const street = (params.street ?? "").trim();
  const flag = params.flag ?? "";
  const supportValues = toArray(params.support)
    .map((s) => Number(s))
    .filter((n) => n >= 1 && n <= 5);
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const where: Prisma.VoterWhereInput = { AND: [{ municipalityId: campaign.municipalityId }] };
  const and = where.AND as Prisma.VoterWhereInput[];

  if (q) {
    // Postgres LIKE is case-sensitive, and the clerk's list arrives in capitals
    // (HOLM, DARREN), so every text comparison here has to say so explicitly.
    and.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { middleName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
        {
          household: {
            is: { streetName: { contains: normaliseStreet(q), mode: "insensitive" } },
          },
        },
      ],
    });
  }
  if (ward) and.push({ household: { is: { ward } } });
  if (street) and.push({ household: { is: { streetName: normaliseStreet(street) } } });
  if (supportValues.length > 0) {
    and.push({ campaignStates: { some: { campaignId, supportLevel: { in: supportValues } } } });
  }
  const flagFilter = flag ? flagWhere(flag, campaignId) : null;
  if (flagFilter) and.push(flagFilter);

  const [total, voters, wards] = await Promise.all([
    db.voter.count({ where }),
    db.voter.findMany({
      where,
      include: {
        household: true,
        campaignStates: { where: { campaignId } },
        contacts: { where: { campaignId }, orderBy: { occurredAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.household.findMany({
      where: { municipalityId: campaign.municipalityId, NOT: { ward: "" } },
      distinct: ["ward"],
      select: { ward: true },
      orderBy: { ward: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Voter file"
        subtitle={`${total.toLocaleString("en-CA")} ${total === 1 ? "person" : "people"} matching your filters`}
        actions={
          <>
            <Link href="/voters/import" className="btn-secondary">
              Import CSV
            </Link>
            <Link href="/voters/new" className="btn-primary">
              Add voter
            </Link>
          </>
        }
      />

      <Card className="mb-6">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="lg:col-span-2">
            <span className="field-label">Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, phone, email or street"
              className="field"
            />
          </label>
          {campaign.municipality.usesWards ? (
            <label>
              <span className="field-label">Ward</span>
              <select name="ward" defaultValue={ward} className="field">
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.ward} value={w.ward}>
                    {w.ward}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span className="field-label">List</span>
            <select name="flag" defaultValue={flag} className="field">
              <option value="">Everyone</option>
              {Object.entries(FLAG_LABELS).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="field-label">Support level</legend>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_LEVEL_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="support"
                    value={o.value}
                    defaultChecked={supportValues.includes(o.value)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="btn-primary">
              Apply filters
            </button>
            <Link href="/voters" className="btn-secondary">
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {voters.length === 0 ? (
          <EmptyState
            title="No voters match"
            hint={
              total === 0 && !q && !flag
                ? "Import your municipal voters' list to get started."
                : "Try widening the filters."
            }
            action={
              <Link href="/voters/import" className="btn-primary">
                Import voters
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Address</Th>
                  <Th>Support</Th>
                  <Th>Contact info</Th>
                  <Th>Last contacted</Th>
                </tr>
              </thead>
              <tbody>
                {voters.map((voter) => {
                  const state = stateOf(voter.campaignStates[0]);
                  return (
                  <tr key={voter.id} className="hover:bg-raise">
                    <Td>
                      <VoterLink
                        id={voter.id}
                        firstName={voter.firstName}
                        lastName={voter.lastName}
                      />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {state.doNotContact ? <Badge tone="bad">Do not contact</Badge> : null}
                        {voter.movedAway ? <Badge tone="warn">Moved</Badge> : null}
                        {voter.deceased ? <Badge tone="neutral">Deceased</Badge> : null}
                        {state.wantsSign ? <Badge tone="brand">Sign</Badge> : null}
                        {state.wantsToVolunteer ? <Badge tone="good">Volunteer</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-muted">
                      {addressLine(voter.household)}
                      {campaign.municipality.usesWards && voter.household?.ward ? (
                        <span className="block text-xs">{voter.household.ward}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <SupportBadge level={state.supportLevel} />
                    </Td>
                    <Td className="text-muted">
                      {voter.phone ? <span className="block">{voter.phone}</span> : null}
                      {voter.email ? (
                        <span className="block truncate text-xs">{voter.email}</span>
                      ) : null}
                      {!voter.phone && !voter.email ? "—" : null}
                    </Td>
                    <Td className="text-muted">
                      {voter.contacts[0] ? formatDate(voter.contacts[0].occurredAt) : "Never"}
                    </Td>
                  </tr>
                  );
                })}
              </tbody>
            </Table>

            {pages > 1 ? (
              <nav className="mt-4 flex items-center justify-between gap-3 text-sm">
                <PageLink
                  params={params}
                  page={page - 1}
                  disabled={page <= 1}
                  label="← Previous"
                />
                <span className="text-muted">
                  Page {page} of {pages}
                </span>
                <PageLink
                  params={params}
                  page={page + 1}
                  disabled={page >= pages}
                  label="Next →"
                />
              </nav>
            ) : null}
          </>
        )}
      </Card>

      {street ? (
        <p className="mt-4 text-sm text-muted">
          Filtered to {titleCase(street)}.{" "}
          <Link href="/voters" className="underline">
            Show all streets
          </Link>
        </p>
      ) : null}
    </>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: Search;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="text-muted opacity-50">{label}</span>;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const v of toArray(value)) query.append(key, v);
  }
  query.set("page", String(page));
  return (
    <Link href={`/voters?${query.toString()}`} className="btn-secondary">
      {label}
    </Link>
  );
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
