import { getCampaign } from "@/lib/campaign";
import { computeLimits, describeSelfFundingFormula, describeSpendingFormula, COMPLIANCE_DISCLAIMER } from "@/lib/ontario";
import { formatCents } from "@/lib/money";
import { toDateInput } from "@/lib/dates";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { authEnabled } from "@/lib/auth";
import { saveCampaign } from "@/app/actions/settings";
import { signOut } from "@/app/actions/auth";
import { Card, Field, Note, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const campaign = await getCampaign();
  const limits = computeLimits(campaign);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Campaign identity and the numbers that drive every compliance figure in the app."
        actions={
          authEnabled() ? (
            <form action={signOut}>
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          ) : null
        }
      />

      <form action={saveCampaign} className="space-y-6">
        <Card title="Campaign">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Candidate name">
              <input
                name="candidateName"
                defaultValue={campaign.candidateName}
                className="field"
                placeholder="Jordan Reyes"
              />
            </Field>
            <Field label="Office sought" hint="Head of council has a higher base limit.">
              <Select name="office" options={OFFICE_OPTIONS} defaultValue={campaign.office} />
            </Field>
            <Field label="Municipality">
              <input
                name="municipality"
                defaultValue={campaign.municipality}
                className="field"
                placeholder="City of Kawartha Lakes"
              />
            </Field>
            <Field label="Ward or district">
              <input
                name="ward"
                defaultValue={campaign.ward}
                className="field"
                placeholder="Ward 3"
              />
            </Field>
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
              <input
                name="votingDay"
                type="date"
                defaultValue={toDateInput(campaign.votingDay)}
                className="field"
              />
            </Field>
            <Field
              label="Campaign period start"
              hint="Normally the day you filed your nomination."
            >
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

        <Card
          title="Ontario limits"
          description="Municipal Elections Act, 1996"
        >
          <div className="space-y-4">
            <Note>{COMPLIANCE_DISCLAIMER}</Note>

            <Field
              label="Eligible electors for this office"
              hint="From the clerk. Drives both the spending limit and the self-funding limit."
            >
              <input
                name="electorCount"
                type="number"
                min={0}
                defaultValue={campaign.electorCount || ""}
                className="field"
                placeholder="12500"
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
                    Appreciation-party limit — <span className="text-xs">10% of the general limit</span>
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
              Enter the clerk&apos;s certified figures below to override the
              calculated ones. Leave blank to keep using the formulas.
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
              <Note tone="warn">
                Certified figures are in use and override the formulas above.
              </Note>
            ) : null}
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">
            Save settings
          </button>
        </div>
      </form>

      <div className="mt-8">
        <Card title="Access">
          <p className="text-sm text-muted">
            {authEnabled()
              ? "A shared password is set. Everyone on the team signs in with it; changing APP_PASSWORD signs everyone out."
              : "No password is set. Set the APP_PASSWORD environment variable before running this anywhere other than your own machine — the database holds electors' names, addresses and phone numbers."}
          </p>
        </Card>
      </div>
    </>
  );
}
