import Link from "next/link";
import { db } from "@/lib/db";
import { buildAudience } from "@/lib/sms";
import { Card, Note, PageHeader } from "@/components/ui";
import { Composer } from "../composer";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

export default async function NewTextPage() {
  const [streets, turfs, audience] = await Promise.all([
    db.household.findMany({
      where: { NOT: { streetName: "" } },
      distinct: ["streetName"],
      select: { streetName: true },
      orderBy: { streetName: "asc" },
      take: 200,
    }),
    db.turf.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    buildAudience({}),
  ]);

  return (
    <>
      <PageHeader
        title="Write a message"
        subtitle="Check the audience and the cost before anything sends."
        actions={
          <Link href="/texting" className="btn-secondary">
            All sends
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Composer
              streets={streets.map((s) => s.streetName)}
              turfs={turfs}
              eligible={audience.length}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Before you send">
            <ul className="space-y-2.5 text-sm text-muted">
              <li>
                <strong className="text-ink">Keep it short.</strong> 160 characters is
                one segment. Going over doubles the cost per recipient, and the
                preview shows exactly where the line falls.
              </li>
              <li>
                <strong className="text-ink">Say something useful.</strong> Where and
                when to vote, a specific ask. A text that reads as spam earns
                complaints, and complaints get campaign numbers blocked by the
                carriers.
              </li>
              <li>
                <strong className="text-ink">Mind the hour.</strong> Nothing in the app
                stops you texting at 11pm; common sense should.
              </li>
              <li>
                <strong className="text-ink">Send once.</strong> Repeated messages to
                the same people is the fastest route to STOP replies.
              </li>
            </ul>
          </Card>

          <Card title="What is added for you">
            <Note>
              Your name and <em>&ldquo;Reply STOP to opt out&rdquo;</em> are appended to
              every message unless your text already includes them. Identifying
              the sender and offering a way out are not optional under Canadian
              anti-spam rules, so the app does not let you skip them.
            </Note>
          </Card>

          {streets.length > 0 ? (
            <Card title="Streets on file" description={`${streets.length} available to target`}>
              <p className="text-xs text-muted">
                {streets
                  .slice(0, 12)
                  .map((s) => titleCase(s.streetName))
                  .join(" · ")}
                {streets.length > 12 ? " …" : ""}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
