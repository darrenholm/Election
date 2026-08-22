import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getLimits } from "@/lib/campaign";
import { CONTRIBUTION_LIMIT_CENTS, ITEMISATION_THRESHOLD_CENTS } from "@/lib/ontario";
import { CONTRIBUTION_METHODS, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteContributor, updateContributor } from "@/app/actions/finance";
import { Badge, Card, Check, EmptyState, Field, LimitBar, Note, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ContributorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [contributor, limits] = await Promise.all([
    db.contributor.findUnique({
      where: { id },
      include: { contributions: { include: { event: true }, orderBy: { receivedAt: "desc" } } },
    }),
    getLimits(),
  ]);

  if (!contributor) notFound();

  const live = contributor.contributions.filter((c) => c.returnedAt === null);
  const totalCents = live.reduce((n, c) => n + c.amountCents, 0);
  const returnedCents = contributor.contributions
    .filter((c) => c.returnedAt !== null)
    .reduce((n, c) => n + c.amountCents, 0);

  const selfFunding = contributor.isCandidate || contributor.isCandidateSpouse;
  const ceiling = selfFunding ? limits.selfFundingLimitCents : CONTRIBUTION_LIMIT_CENTS;

  const save = updateContributor.bind(null, contributor.id);
  const remove = deleteContributor.bind(null, contributor.id);

  return (
    <>
      <PageHeader
        title={`${contributor.firstName} ${contributor.lastName}`.trim() || "Unnamed contributor"}
        subtitle={
          [contributor.addressLine, contributor.city, contributor.postalCode]
            .filter(Boolean)
            .join(", ") || "No address on file"
        }
        actions={
          <Link href="/finance/contributions" className="btn-secondary">
            All contributions
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {contributor.isCandidate ? <Badge tone="brand">Candidate</Badge> : null}
        {contributor.isCandidateSpouse ? <Badge tone="brand">Candidate&apos;s spouse</Badge> : null}
        {!contributor.ontarioResident ? (
          <Badge tone="bad">Not an Ontario resident — ineligible</Badge>
        ) : null}
        {totalCents > ITEMISATION_THRESHOLD_CENTS ? (
          <Badge tone="warn">Itemised on Form 4</Badge>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Against the limit">
            <LimitBar
              label={selfFunding ? "Candidate and spouse self-funding" : "Per-contributor limit"}
              value={totalCents}
              limit={ceiling}
              valueLabel={formatCents(totalCents)}
              limitLabel={formatCents(ceiling)}
            />
            {returnedCents > 0 ? (
              <p className="mt-3 text-sm text-muted">
                {formatCents(returnedCents)} has been returned and does not count
                toward the limit.
              </p>
            ) : null}
            {!selfFunding ? (
              <div className="mt-4">
                <Note>
                  A contributor may also give at most{" "}
                  {formatCents(500_000)} in total to all candidates for offices
                  on the same council. This app only sees your campaign, so that
                  aggregate cap is the contributor&apos;s to watch.
                </Note>
              </div>
            ) : null}
          </Card>

          <Card title="Contributions" description={`${contributor.contributions.length} on file`}>
            {contributor.contributions.length === 0 ? (
              <EmptyState title="Nothing recorded from this contributor yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Received</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Method</Th>
                    <Th>Receipt</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {contributor.contributions.map((c) => (
                    <tr key={c.id} className={c.returnedAt ? "opacity-60" : undefined}>
                      <Td>{formatDate(c.receivedAt)}</Td>
                      <Td className="text-right tabular-nums font-medium">
                        {formatCents(c.amountCents)}
                      </Td>
                      <Td className="text-muted">{label(CONTRIBUTION_METHODS, c.method)}</Td>
                      <Td className="tabular-nums text-xs">{c.receiptNumber || "—"}</Td>
                      <Td className="text-muted">
                        {c.returnedAt ? `Returned: ${c.returnReason}` : c.notes || "—"}
                        {c.event ? <span className="block text-xs">{c.event.name}</span> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Edit contributor">
            <form action={save} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input name="firstName" defaultValue={contributor.firstName} className="field" required />
                </Field>
                <Field label="Last name">
                  <input name="lastName" defaultValue={contributor.lastName} className="field" />
                </Field>
              </div>
              <Field label="Address">
                <input name="addressLine" defaultValue={contributor.addressLine} className="field" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="City">
                  <input name="city" defaultValue={contributor.city} className="field" />
                </Field>
                <Field label="Postal code">
                  <input name="postalCode" defaultValue={contributor.postalCode} className="field" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <input name="email" type="email" defaultValue={contributor.email} className="field" />
                </Field>
                <Field label="Phone">
                  <input name="phone" type="tel" defaultValue={contributor.phone} className="field" />
                </Field>
              </div>
              <div className="space-y-2">
                <Check
                  name="ontarioResident"
                  label="Individual normally resident in Ontario"
                  defaultChecked={contributor.ontarioResident}
                />
                <Check
                  name="isCandidate"
                  label="This is the candidate"
                  defaultChecked={contributor.isCandidate}
                />
                <Check
                  name="isCandidateSpouse"
                  label="Spouse of the candidate"
                  defaultChecked={contributor.isCandidateSpouse}
                />
              </div>
              <Field label="Notes">
                <textarea name="notes" rows={2} defaultValue={contributor.notes} className="field" />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Save contributor
              </button>
            </form>
          </Card>

          <Card title="Remove">
            <p className="mb-3 text-sm text-muted">
              Deleting the contributor leaves their contributions on the books
              with no name attached, so the totals stay correct. Fix a mistaken
              entry by editing it instead.
            </p>
            <form action={remove}>
              <button type="submit" className="btn-danger">
                Delete contributor
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
