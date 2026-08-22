import Link from "next/link";
import { createVoter } from "@/app/actions/voters";
import { Card, PageHeader } from "@/components/ui";
import { VoterFormFields } from "@/components/voter-form";

export default function NewVoterPage() {
  return (
    <>
      <PageHeader
        title="Add a voter"
        subtitle="For people who are not on the clerk's list, or whose details you picked up at an event."
        actions={
          <Link href="/voters" className="btn-secondary">
            Back to voter file
          </Link>
        }
      />
      <form action={createVoter}>
        <Card>
          <VoterFormFields />
        </Card>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="btn-primary">
            Add voter
          </button>
        </div>
      </form>
    </>
  );
}
