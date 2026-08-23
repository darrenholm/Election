import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCampaign } from "@/lib/campaign";
import { db } from "@/lib/db";
import {
  computeLimits,
  describeSelfFundingFormula,
  describeSpendingFormula,
  COMPLIANCE_DISCLAIMER,
} from "@/lib/ontario";
import { formatCents } from "@/lib/money";
import { toDateInput } from "@/lib/dates";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { getCurrentUser } from "@/lib/auth";
import { smsConfig } from "@/lib/sms";
import { SettingsForm } from "./settings-form";
import { signOut } from "@/app/actions/auth";
import { Card, Field, Note, PageHeader, Select } from "@/components/ui";
import { MunicipalitySetting } from "./municipality-setting";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [campaign, user] = await Promise.all([getActiveCampaign(), getCurrentUser()]);
  if (!campaign) redirect("/campaigns");

  const [municipalities, contacts, states, turfs] = await Promise.all([
    db.municipality.findMany({
      include: { _count: { select: { campaigns: true } } },
      orderBy: { name: "asc" },
    }),
    db.contactAttempt.count({ where: { campaignId: campaign.id } }),
    db.voterCampaignState.count({ where: { campaignId: campaign.id } }),
    db.turf.count({ where: { campaignId: campaign.id } }),
  ]);
  // A campaign with canvassing data cannot be moved without stranding it.
  const canMove = contacts + states + turfs === 0;

  const limits = computeLimits(campaign);
  const twilio = smsConfig();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`${campaign.candidateName} — ${campaign.municipality.name}. These figures drive every compliance number for this candidate.`}
        actions={
          <>
            <Link href="/campaigns" className="btn-secondary">
              All campaigns
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          </>
        }
      />

      <div className="mb-6">
        <Note>
          You are editing <strong>{campaign.candidateName}</strong>. Other
          campaigns have their own settings, limits and books — switch between
          them from the panel at the top of the sidebar.
        </Note>
      </div>

      <SettingsForm campaignId={campaign.id}>
        <Card title="Candidate">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Candidate name">
              <input name="candidateName" defaultValue={campaign.candidateName} className="field" required />
            </Field>
            <Field label="Office sought" hint="Head of council has a higher base limit.">
              <Select name="office" options={OFFICE_OPTIONS} defaultValue={campaign.office} />
            </Field>
            <MunicipalitySetting
              currentId={campaign.municipalityId}
              currentName={campaign.municipality.name}
              municipalities={municipalities.map((m) => ({
                id: m.id,
                name: m.name,
                campaigns: m._count.campaigns,
              }))}
              usesWards={campaign.municipality.usesWards}
              ward={campaign.ward}
              canMove={canMove}
            />
            <Field label="Campaign email">
              <input name="contactEmail" type="email" defaultValue={campaign.contactEmail} className="field" />
            </Field>
            <Field label="Campaign phone">
              <input name="contactPhone" defaultValue={campaign.contactPhone} className="field" />
            </Field>
          </div>
        </Card>

        <Card title="Dates">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Voting day">
              <input name="votingDay" type="date" defaultValue={toDateInput(campaign.votingDay)} className="field" />
            </Field>
            <Field label="Campaign period start" hint="Normally the day you filed your nomination.">
              <input
                name="campaignPeriodStart"
                type="date"
                defaultValue={toDateInput(campaign.campaignPeriodStart)}
                className="field"
              />
            </Field>
            <Field label="Campaign period end" hint="Usually 31 December of the election year.">
              <input
                name="campaignPeriodEnd"
                type="date"
                defaultValue={toDateInput(campaign.campaignPeriodEnd)}
                className="field"
              />
            </Field>
          </div>
        </Card>

        <Card title="Ontario limits" description="Municipal Elections Act, 1996">
          <div className="space-y-4">
            <Note>{COMPLIANCE_DISCLAIMER}</Note>

            <Field
              label="Eligible electors for this office"
              hint="From the clerk. Drives both the spending limit and the self-funding limit. Where council is elected at large this is the whole municipality, not a ward."
            >
              <input
                name="electorCount"
                type="number"
                min={0}
                defaultValue={campaign.electorCount || ""}
                className="field"
                placeholder="8200"
              />
            </Field>

            <div className="rounded-lg border border-line bg-raise p-3 text-sm">
              <p className="font-semibold">Calculated from the formulas</p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted">
                    General spending limit —{" "}
                    <span className="text-xs">
                      {describeSpendingFormula(campaign.office, campaign.electorCount)}
                    </span>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(
                      computeLimits({ ...campaign, certifiedSpendingLimitCents: null })
                        .spendingLimitCents,
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted">
                    Appreciation-party limit —{" "}
                    <span className="text-xs">10% of the general limit</span>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(
                      computeLimits({
                        ...campaign,
                        certifiedSpendingLimitCents: null,
                        certifiedPartyExpenseLimitCents: null,
                      }).partyExpenseLimitCents,
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted">
                    Candidate + spouse self-funding —{" "}
                    <span className="text-xs">
                      {describeSelfFundingFormula(campaign.office, campaign.electorCount)}
                    </span>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(
                      computeLimits({ ...campaign, certifiedSelfFundingLimitCents: null })
                        .selfFundingLimitCents,
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="text-sm text-muted">
              Enter the clerk&apos;s certified figures below to override the calculated
              ones. Leave blank to keep using the formulas.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Certified spending limit">
                <input
                  name="certifiedSpendingLimit"
                  className="field"
                  placeholder="$0.00"
                  defaultValue={
                    campaign.certifiedSpendingLimitCents != null
                      ? (campaign.certifiedSpendingLimitCents / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
              <Field label="Certified party-expense limit">
                <input
                  name="certifiedPartyExpenseLimit"
                  className="field"
                  placeholder="$0.00"
                  defaultValue={
                    campaign.certifiedPartyExpenseLimitCents != null
                      ? (campaign.certifiedPartyExpenseLimitCents / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
              <Field label="Certified self-funding limit">
                <input
                  name="certifiedSelfFundingLimit"
                  className="field"
                  placeholder="$0.00"
                  defaultValue={
                    campaign.certifiedSelfFundingLimitCents != null
                      ? (campaign.certifiedSelfFundingLimitCents / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
            </div>

            {limits.certified.spending || limits.certified.partyExpense || limits.certified.selfFunding ? (
              <Note tone="warn">Certified figures are in use and override the formulas above.</Note>
            ) : null}
          </div>
        </Card>

        <Card
          title="Text messaging"
          description="This candidate's own sending identity"
        >
          <div className="space-y-4">
            <Note>
              Each candidate must text from their own number. Consent runs to a
              named sender, so one shared number would make every opt-out
              ambiguous — and a STOP meant for one candidate would either
              under-honour or wrongly silence the others. The Twilio account
              credentials live in the environment; only the sending identity is
              set here.
            </Note>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From number" hint="E.164, e.g. +15195550134">
                <input
                  name="twilioFromNumber"
                  defaultValue={campaign.twilioFromNumber}
                  className="field"
                  placeholder="+15195550134"
                />
              </Field>
              <Field label="Messaging service SID" hint="Preferred over a bare number where you have one.">
                <input
                  name="twilioMessagingServiceSid"
                  defaultValue={campaign.twilioMessagingServiceSid}
                  className="field"
                  placeholder="MG…"
                />
              </Field>
            </div>
            {!twilio.configured ? (
              <Note tone="warn">
                No Twilio account credentials are configured, so sending runs in
                dry-run mode whatever is entered here.
              </Note>
            ) : null}
          </div>
        </Card>

      </SettingsForm>

      <div className="mt-8">
        <Card title="Access">
          <p className="text-sm text-muted">
            You are signed in as <strong>{user?.email}</strong>
            {user?.isAdmin ? " (administrator)" : ""}.
          </p>
          <p className="mt-2 text-sm text-muted">
            Each account reaches only the campaigns it has been given. Add people
            and grant access on the{" "}
            <Link href="/team" className="underline">
              team page
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
