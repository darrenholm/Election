import Link from "next/link";
import { Card, Note, PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export default function ImportPage() {
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
          The file is read in your browser — nothing is uploaded until you press
          Import, and only the columns you map are stored.
        </Note>
        <Note tone="warn">
          The municipal voters&apos; list may only be used for election
          purposes. Keep it inside the campaign, and delete it when the campaign
          period ends.
        </Note>
      </div>

      <Card title="Choose a file">
        <ImportWizard />
      </Card>

      <Card title="What the columns mean" className="mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Definition term="List ID">
            The clerk&apos;s unique identifier for the elector. Map it if you have
            it — re-importing an updated list will then refresh existing records
            instead of creating duplicates.
          </Definition>
          <Definition term="Street number and street">
            Kept separate so walk lists can sort down a street in door order
            rather than alphabetically.
          </Definition>
          <Definition term="Unit">
            Apartment or suite. Two voters at the same street address with
            different units are treated as different doors.
          </Definition>
          <Definition term="Ward and poll">
            Optional, but they let you filter the voter file and build turf by
            poll.
          </Definition>
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
