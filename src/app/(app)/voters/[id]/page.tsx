import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { stateOf } from "@/lib/voter-state";
import { getSlateNotesForVoter } from "@/lib/slate";
import { CONTACT_METHODS, CONTACT_RESULTS, SIGN_STATUSES, label, splitList } from "@/lib/enums";
import { formatDateTime, formatDate } from "@/lib/dates";
import { deleteVoter, updateVoter, toggleVoted } from "@/app/actions/voters";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SupportBadge, fullAddress, titleCase } from "@/components/voter";
import { VoterFormFields } from "@/components/voter-form";
import { ContactForm } from "@/components/contact-form";

export const dynamic = "force-dynamic";

export default async function VoterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await getActiveCampaign();
  if (!campaign) notFound();
  const campaignId = campaign.id;

  const [voter, volunteers] = await Promise.all([
    db.voter.findUnique({
      where: { id },
      include: {
        campaignStates: { where: { campaignId } },
        household: {
          include: {
            voters: { include: { campaignStates: { where: { campaignId } } } },
            turfHouseholds: { where: { turf: { campaignId } }, include: { turf: true } },
          },
        },
        contacts: {
          where: { campaignId },
          include: {
            volunteer: true,
            photos: { select: { id: true, mayPublish: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { occurredAt: "desc" },
        },
        signRequests: { where: { campaignId }, orderBy: { requestedAt: "desc" } },
      },
    }),
    db.volunteer.findMany({
      where: { campaignId, status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  if (!voter) notFound();
  const state = stateOf(voter.campaignStates[0]);
  const slateNotes = await getSlateNotesForVoter(campaignId, voter.id);
  const turf = voter.household?.turfHouseholds[0]?.turf ?? null;

  const name = `${titleCase(voter.firstName)} ${titleCase(voter.lastName)}`.trim();
  const housemates = (voter.household?.voters ?? []).filter((v) => v.id !== voter.id);

  const markVoted = toggleVoted.bind(null, voter.id, state.votedAt === null);
  const removeVoter = deleteVoter.bind(null, voter.id);
  const saveVoter = updateVoter.bind(null, voter.id);

  return (
    <>
      <PageHeader
        title={name || "Unnamed voter"}
        subtitle={fullAddress(voter.household)}
        actions={
          <>
            <Link href="/voters" className="btn-secondary">
              Voter file
            </Link>
            <form action={markVoted}>
              <button type="submit" className={state.votedAt ? "btn-secondary" : "btn-primary"}>
                {state.votedAt ? "Undo voted" : "Mark voted"}
              </button>
            </form>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SupportBadge level={state.supportLevel} />
        {state.votedAt ? <Badge tone="good">Voted {formatDate(state.votedAt)}</Badge> : null}
        {state.doNotContact ? <Badge tone="bad">Do not contact</Badge> : null}
        {voter.movedAway ? <Badge tone="warn">Moved away</Badge> : null}
        {voter.deceased ? <Badge tone="neutral">Deceased</Badge> : null}
        {state.wantsSign ? <Badge tone="brand">Wants a sign</Badge> : null}
        {state.wantsToVolunteer ? <Badge tone="good">Will volunteer</Badge> : null}
        {state.isDonorProspect ? <Badge tone="brand">Donor prospect</Badge> : null}
        {state.willEndorsePublicly ? (
          <Badge tone="good">Will endorse publicly</Badge>
        ) : state.endorsementAt ? (
          <Badge tone="neutral">Asked — not publicly</Badge>
        ) : null}
        {splitList(state.tags).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Record a contact">
            <ContactForm
              voterId={voter.id}
              volunteers={volunteers}
              draftScope={campaignId}
              knownPhone={voter.phone}
              knownEmail={voter.email}
              smsConsent={state.smsConsent}
            />
          </Card>

          {slateNotes.length > 0 ? (
            <Card
              title="From the slate"
              description="Recorded by other candidates you are sharing canvass notes with."
            >
              <ol className="space-y-3">
                {slateNotes.map((note, i) => (
                  <li key={`${note.campaignId}-${i}`} className="border-l-2 border-brand/40 pl-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="brand">{note.candidateName}</Badge>
                      <span className="font-medium">{label(CONTACT_RESULTS, note.result)}</span>
                      {note.supportLevel !== null ? (
                        <SupportBadge level={note.supportLevel} />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">{formatDateTime(note.occurredAt)}</p>
                    {note.notes ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm">{note.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">
                Support levels shown here are that candidate&apos;s reading, not
                yours. Text-message consent is never shared between campaigns.
              </p>
            </Card>
          ) : null}

          <Card
            title="Contact history"
            description={`${voter.contacts.length} recorded ${voter.contacts.length === 1 ? "attempt" : "attempts"}`}
          >
            {voter.contacts.length === 0 ? (
              <EmptyState
                title="No contact recorded yet"
                hint="Every knock, call and conversation logged here builds the picture for voting day."
              />
            ) : (
              <ol className="space-y-3">
                {voter.contacts.map((contact) => (
                  <li key={contact.id} className="border-l-2 border-line pl-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {label(CONTACT_RESULTS, contact.result)}
                      </span>
                      <Badge>{label(CONTACT_METHODS, contact.method)}</Badge>
                      {contact.supportLevel !== null ? (
                        <SupportBadge level={contact.supportLevel} />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">
                      {formatDateTime(contact.occurredAt)}
                      {contact.volunteer
                        ? ` · ${contact.volunteer.firstName} ${contact.volunteer.lastName}`.trimEnd()
                        : ""}
                    </p>
                    {contact.notes ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm">{contact.notes}</p>
                    ) : null}
                    {contact.followUpNeeded ? (
                      <p className="mt-1 text-sm">
                        <Badge tone={contact.followUpDoneAt ? "good" : "warn"}>
                          {contact.followUpDoneAt ? "Followed up" : "Follow-up needed"}
                        </Badge>{" "}
                        <span className="text-muted">{contact.followUpReason}</span>
                      </p>
                    ) : null}
                    {contact.photos.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contact.photos.map((photo) => (
                          <figure key={photo.id}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/photos/${photo.id}`}
                              alt="Taken at this door"
                              className="h-28 w-auto rounded-lg border border-line"
                            />
                            {!photo.mayPublish ? (
                              <figcaption className="mt-0.5 text-xs text-accent-ink">
                                Not cleared for publication
                              </figcaption>
                            ) : null}
                          </figure>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Edit details">
            <form action={saveVoter} className="space-y-4">
              <VoterFormFields voter={{ ...voter, ...state }} showWards={campaign.municipality.usesWards} />
              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Contact details">
            <dl className="space-y-2 text-sm">
              <Row label="Phone" value={voter.phone || "—"} />
              <Row label="Email" value={voter.email || "—"} />
              <Row label="Language" value={voter.language || "—"} />
              {campaign.municipality.usesWards ? (
                <Row label="Ward" value={voter.household?.ward || "—"} />
              ) : null}
              <Row label="Poll" value={voter.household?.pollNumber || "—"} />
              <Row
                label="Turf"
                value={
                  turf ? (
                    <Link href={`/canvass/${turf.id}`} className="underline">
                      {turf.name}
                    </Link>
                  ) : (
                    "Not in a turf"
                  )
                }
              />
              {voter.externalId ? <Row label="List ID" value={voter.externalId} /> : null}
            </dl>
            {state.notes ? (
              <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm">
                {state.notes}
              </p>
            ) : null}
          </Card>

          {housemates.length > 0 ? (
            <Card title="Same address" description={`${housemates.length} other on file`}>
              <ul className="space-y-2 text-sm">
                {housemates.map((mate) => (
                  <li key={mate.id} className="flex items-center justify-between gap-2">
                    <Link href={`/voters/${mate.id}`} className="hover:underline">
                      {titleCase(mate.firstName)} {titleCase(mate.lastName)}
                    </Link>
                    <SupportBadge level={stateOf(mate.campaignStates[0]).supportLevel} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {voter.signRequests.length > 0 ? (
            <Card title="Lawn signs">
              <Table>
                <thead>
                  <tr>
                    <Th>Requested</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {voter.signRequests.map((sign) => (
                    <tr key={sign.id}>
                      <Td>{formatDate(sign.requestedAt)}</Td>
                      <Td>{label(SIGN_STATUSES, sign.status)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Link href="/signs" className="mt-3 inline-block text-sm underline">
                Open the sign board
              </Link>
            </Card>
          ) : null}

          <Card title="Danger zone">
            <p className="mb-3 text-sm text-muted">
              Deleting removes this elector from the municipal file — for
              <strong> every campaign in {campaign.municipality.name}</strong>, not
              just this one. Prefer &ldquo;do not contact&rdquo; for people who ask to
              be left alone: it keeps them off this campaign&apos;s lists without
              touching anyone else&apos;s, and without losing the record that they
              asked.
            </p>
            <form action={removeVoter}>
              <button type="submit" className="btn-danger">
                Delete this voter
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{name}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
