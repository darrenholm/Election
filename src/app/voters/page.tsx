import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SUPPORT_LEVEL_OPTIONS } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SupportBadge, VoterLink, addressLine, titleCase } from "@/components/voter";
import { normaliseStreet } from "@/lib/address";

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
const FLAGS: Record<string, { label: string; where: Prisma.VoterWhereInput }> = {
  "needs-id": { label: "Not yet identified", where: { supportLevel: null } },
  supporters: { label: "Supporters (1–2)", where: { supportLevel: { in: [1, 2] } } },
  undecided: { label: "Undecided (3)", where: { supportLevel: 3 } },
  signs: { label: "Wants a sign", where: { wantsSign: true } },
  volunteers: { label: "Offered to volunteer", where: { wantsToVolunteer: true } },
  donors: { label: "Donor prospects", where: { isDonorProspect: true } },
  phone: { label: "Has a phone number", where: { NOT: { phone: "" } } },
  dnc: { label: "Do not contact", where: { doNotContact: true } },
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

  const where: Prisma.VoterWhereInput = { AND: [] };
  const and = where.AND as Prisma.VoterWhereInput[];

  if (q) {
    // SQLite's LIKE is case-insensitive for ASCII, which covers name search
    // without needing a separate normalised column.
    and.push({
      OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { household: { is: { streetName: { contains: normaliseStreet(q) } } } },
      ],
    });
  }
  if (ward) and.push({ household: { is: { ward } } });
  if (street) and.push({ household: { is: { streetName: normaliseStreet(street) } } });
  if (supportValues.length > 0) and.push({ supportLevel: { in: supportValues } });
  if (flag && FLAGS[flag]) and.push(FLAGS[flag].where);

  const [total, voters, wards] = await Promise.all([
    db.voter.count({ where }),
    db.voter.findMany({
      where,
      include: { household: true, contacts: { orderBy: { occurredAt: "desc" }, take: 1 } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.household.findMany({
      where: { NOT: { ward: "" } },
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
          <label>
            <span className="field-label">List</span>
            <select name="flag" defaultValue={flag} className="field">
              <option value="">Everyone</option>
              {Object.entries(FLAGS).map(([key, f]) => (
                <option key={key} value={key}>
                  {f.label}
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
                {voters.map((voter) => (
                  <tr key={voter.id} className="hover:bg-raise">
                    <Td>
                      <VoterLink
                        id={voter.id}
                        firstName={voter.firstName}
                        lastName={voter.lastName}
                      />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {voter.doNotContact ? <Badge tone="bad">Do not contact</Badge> : null}
                        {voter.movedAway ? <Badge tone="warn">Moved</Badge> : null}
                        {voter.deceased ? <Badge tone="neutral">Deceased</Badge> : null}
                        {voter.wantsSign ? <Badge tone="brand">Sign</Badge> : null}
                        {voter.wantsToVolunteer ? <Badge tone="good">Volunteer</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-muted">
                      {addressLine(voter.household)}
                      {voter.household?.ward ? (
                        <span className="block text-xs">{voter.household.ward}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <SupportBadge level={voter.supportLevel} />
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
                ))}
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
