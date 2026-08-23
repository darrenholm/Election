import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { hasRole } from "@/lib/auth";
import { POST_KINDS, POST_STATUSES, label, splitList } from "@/lib/enums";
import { formatDate, formatDateTime, toDateInput } from "@/lib/dates";
import { facebookConfig } from "@/lib/facebook";
import { describeCadence, planDefaults } from "@/lib/post-plan";
import { disconnectPage } from "@/app/actions/social";
import { Badge, Card, EmptyState, Note, PageHeader, StatTile } from "@/components/ui";
import { PlanForm } from "./plan-form";
import { PublishRunner } from "./publish-runner";

export const dynamic = "force-dynamic";

const CONNECT_MESSAGES: Record<string, string> = {
  ok: "Page connected.",
  cancelled: "Facebook cancelled that — nothing was connected.",
  unconfigured: "No Meta app is configured on this install, so there is nothing to connect to yet.",
  forbidden: "You need manager access on this campaign to connect a Page.",
  state: "That connection attempt did not check out, so it was refused. Start again.",
  nocode: "Facebook sent us back without an authorisation code.",
  exchange: "Facebook would not exchange the code for a token.",
  pages: "Could not read the list of Pages from Facebook.",
  nopages: "That account does not administer any Facebook Page.",
};

/**
 * The Facebook section.
 *
 * Two questions, in order: how often is this campaign going to post, and what
 * is the next one going to say. The plan answers the first once; the schedule
 * below answers the second every few days, with a draft already in the box.
 */
export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const campaign = await getActiveCampaign();
  if (!campaign) {
    return (
      <>
        <PageHeader title="Facebook" />
        <EmptyState title="No campaign selected" hint="Pick a candidate first." />
      </>
    );
  }

  const [plan, posts, canManage, params] = await Promise.all([
    db.postPlan.findUnique({ where: { campaignId: campaign.id } }),
    db.socialPost.findMany({
      where: { campaignId: campaign.id },
      orderBy: { scheduledFor: "asc" },
      take: 400,
    }),
    hasRole(campaign.id, "MANAGER"),
    searchParams,
  ]);

  const config = facebookConfig();
  const shape = plan ?? planDefaults(campaign, campaign.campaignPeriodStart);

  const now = new Date();
  const upcoming = posts.filter((post) => post.status !== "PUBLISHED" && post.status !== "SKIPPED");
  const published = posts.filter((post) => post.status === "PUBLISHED");
  const ready = posts.filter((post) => post.status === "APPROVED");
  const due = ready.filter((post) => post.scheduledFor <= now && !post.providerPostId);
  const stillSuggested = posts.filter((post) => post.status === "SUGGESTED");
  const next = upcoming.find((post) => post.scheduledFor >= now) ?? upcoming[0];

  const connected = Boolean(campaign.facebookPageId);
  const message = params.connect ? CONNECT_MESSAGES[params.connect] : null;

  if (!canManage) {
    return (
      <>
        <PageHeader title="Facebook" subtitle="What this campaign is posting, and how often." />
        <Note tone="warn">
          Posting goes out over the candidate&apos;s own name, so it is limited to
          the candidate and their manager — the same bar as texting and the
          money. You can see the plan on this page but not change it.
        </Note>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Facebook"
        subtitle="Set the rhythm once, then keep ahead of the drafts."
      />

      {message ? (
        <div className="mb-4">
          <Note tone={params.connect === "ok" ? "info" : "warn"}>{message}</Note>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Planned" value={upcoming.length} />
        <StatTile label="Ready to post" value={ready.length} />
        <StatTile label="Posted" value={published.length} />
        <StatTile
          label="Next one"
          value={next ? formatDate(next.scheduledFor) : "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="The schedule"
            description={plan ? describeCadence(shape, upcoming.length) : "No plan yet — set the cadence on the right."}
            actions={<PublishRunner due={due.length} />}
          >
            {stillSuggested.length > 0 ? (
              <div className="mb-3">
                <Note tone="warn">
                  {stillSuggested.length} of these are still the app&apos;s own
                  wording, with the blanks unfilled. They are drafts to argue
                  with, not posts — nothing goes out until you approve it.
                </Note>
              </div>
            ) : null}

            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                hint="Set a cadence on the right and the app will lay out every slot between now and voting day."
              />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 60).map((post) => {
                  const overdue = post.scheduledFor < now;
                  return (
                    <li key={post.id} className="py-2.5">
                      <Link href={`/social/${post.id}`} className="block hover:opacity-80">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium tabular-nums">
                            {formatDateTime(post.scheduledFor)}
                          </span>
                          <Badge tone="brand">{label(POST_KINDS, post.kind)}</Badge>
                          <Badge
                            tone={
                              post.status === "APPROVED"
                                ? "good"
                                : post.status === "FAILED"
                                  ? "bad"
                                  : "neutral"
                            }
                          >
                            {label(POST_STATUSES, post.status)}
                          </Badge>
                          {overdue && post.status === "APPROVED" ? (
                            <Badge tone="warn">Due</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted">
                          {post.body.split("\n")[0]}
                        </p>
                        {post.errorMessage ? (
                          <p className="mt-1 text-xs text-accent-ink">{post.errorMessage}</p>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {published.length > 0 ? (
            <Card title="Already posted">
              <ul className="divide-y divide-line">
                {published.slice(-20).reverse().map((post) => (
                  <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/social/${post.id}`} className="min-w-0 text-sm hover:underline">
                      <span className="tabular-nums text-muted">{formatDate(post.publishedAt)}</span>{" "}
                      {post.body.split("\n")[0].slice(0, 70)}
                    </Link>
                    {post.dryRun ? <Badge tone="warn">Dry run</Badge> : <Badge tone="good">On Facebook</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="The Page">
            {connected ? (
              <>
                <p className="text-sm font-medium">{campaign.facebookPageName || campaign.facebookPageId}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {campaign.facebookTokenExpiresAt
                    ? `Access lasts until ${formatDate(campaign.facebookTokenExpiresAt)}. Reconnect before then or posting stops.`
                    : "Connected."}
                </p>
                <form action={disconnectPage} className="mt-3">
                  <button type="submit" className="btn-ghost text-xs">
                    Disconnect
                  </button>
                </form>
              </>
            ) : config.configured ? (
              <>
                <p className="text-sm text-muted">
                  Nothing connected, so posts are written and scheduled but never
                  leave the app.
                </p>
                <a href="/api/facebook/connect" className="btn-primary mt-3 inline-block">
                  Connect a Facebook Page
                </a>
              </>
            ) : (
              <Note tone="warn">
                No Meta app is configured on this install, so everything here
                runs as a dry run: the plan, the drafts and the schedule all
                work, and posting records what would have gone out. Set
                <code className="mx-1">FACEBOOK_APP_ID</code> and
                <code className="mx-1">FACEBOOK_APP_SECRET</code> once Meta has
                approved the app.
              </Note>
            )}
          </Card>

          <Card title="How often" description="Change it whenever; the schedule redraws.">
            <PlanForm
              plan={{
                daysOfWeek: splitList(shape.daysOfWeek),
                timeOfDay: shape.timeOfDay,
                rampWeeks: shape.rampWeeks,
                rampDaysOfWeek: splitList(shape.rampDaysOfWeek),
                startsOn: toDateInput(shape.startsOn),
                endsOn: toDateInput(shape.endsOn),
                mix: splitList(shape.mix),
              }}
            />
          </Card>

          <Card title="Before you connect">
            <Note>
              Posting to a Page needs a Meta developer app with{" "}
              <strong>pages_manage_posts</strong>, and Meta reviews that before
              it works for anyone but the app&apos;s own testers. Budget weeks,
              not days, and start the review early — the plan and the drafts all
              work in the meantime.
            </Note>
          </Card>
        </div>
      </div>
    </>
  );
}
