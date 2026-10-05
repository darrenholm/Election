import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveCampaign } from "@/lib/campaign";
import { Card, Note, PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

// Reads the campaign's ward setting, so this page must render per request
// rather than being baked in at build time.
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  return (
    <>
      <PageHeader
        title="Import voters"
        subtitle="Load the clerk's voters' list, or any CSV of names and addresses."
        actions={
          <Link href="/voters" className="btn-secondary">
            Back to voter file
          </Link>
        }
      />

      <div className="mb-6 space-y-3">
        <Note>
          The file is read in your browser, and only the columns you map ever
          leave it. Checking it against the voter file saves nothing — you see
          every change first, and confirm it.
        </Note>
        <Note tone="warn">
          The municipal voters&apos; list may only be used for election
          purposes. Keep it inside the campaign, and delete it when the campaign
          period ends.
        </Note>
      </div>

      <Card title="Choose a file">
        <ImportWizard showWards={campaign.municipality.usesWards} />
      </Card>

      <Card title="What the columns mean" className="mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Definition term="List ID">
            The clerk&apos;s unique identifier for the elector, and the surest way
            to recognise someone already on file. Map it if you have it. Without
            it — or when the clerk renumbers the list between issues — a
            re-import falls back to matching on name and address.
          </Definition>
          <Definition term="Street number and street">
            Kept separate so walk lists can sort down a street in door order
            rather than alphabetically. A list that writes them together — &ldquo;58
            Concession 4 E&rdquo; — maps to <strong>Street address</strong> instead and is
            split on the way in.
          </Definition>
          <Definition term="Name (surname first)">
            For a list with one name column reading &ldquo;GIBSON  CHERYL LYNN&rdquo; or
            &ldquo;GIBSON, CHERYL LYNN&rdquo;. Map it here and the surname and given names
            are separated for you; the preview shows the result before anything
            is sent.
          </Definition>
          <Definition term="Unit">
            Apartment or suite. Two voters at the same street address with
            different units are treated as different doors.
          </Definition>
          {campaign.municipality.usesWards ? (
            <Definition term="Ward and poll">
              Optional, but they let you filter the voter file and build turf by
              poll.
            </Definition>
          ) : (
            <Definition term="Poll">
              Optional, but it lets you build turf by poll and cross-check
              against the poll book on voting day.
            </Definition>
          )}
        </dl>
      </Card>
    </>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{term}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}
