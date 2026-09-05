import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ROLES, ROLE_OPTIONS, type Role } from "@/lib/roles";
import { OFFICES, label } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { grantAccess, revokeAccess, setUserActive } from "@/app/actions/team";
import { Badge, Card, EmptyState, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { NewMemberForm } from "./new-member-form";
import { ResetButton } from "./reset-button";

export const dynamic = "force-dynamic";

/**
 * Accounts and who can reach which campaign.
 *
 * Administrators only. This is the page that keeps five candidates in one town
 * from reading each other's canvass.
 */
export default async function TeamPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/");

  const [users, campaigns] = await Promise.all([
    db.user.findMany({
      include: {
        access: {
          include: { campaign: { include: { municipality: { select: { name: true } } } } },
        },
      },
      orderBy: [{ isAdmin: "desc" }, { name: "asc" }, { email: "asc" }],
    }),
    db.campaign.findMany({
      where: { isActive: true },
      include: { municipality: { select: { name: true } } },
      orderBy: [{ municipality: { name: "asc" } }, { candidateName: "asc" }],
    }),
  ]);

  const campaignOptions = campaigns.map((c) => ({
    id: c.id,
    label: `${c.candidateName} — ${label(OFFICES, c.office)}, ${c.municipality.name}`,
  }));

  const withoutAccess = users.filter((u) => !u.isAdmin && u.access.length === 0);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Who can sign in, and which campaigns they can reach."
      />

      <div className="mb-6 space-y-3">
        <Note>
          Each account reaches only the campaigns granted to it. Candidates
          running in the same municipality share the address file and the
          voters&apos; list, but never each other&apos;s support levels, contacts,
          donors or consent records.
        </Note>
        {withoutAccess.length > 0 ? (
          <Note tone="warn">
            {withoutAccess.length} account
            {withoutAccess.length === 1 ? " has" : "s have"} no campaign access
            and will see nothing after signing in.
          </Note>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Accounts" value={users.length} />
        <StatTile label="Administrators" value={users.filter((u) => u.isAdmin).length} />
        <StatTile label="Campaigns" value={campaigns.length} />
        <StatTile
          label="Never signed in"
          value={users.filter((u) => !u.lastSignInAt).length}
          tone={users.some((u) => !u.lastSignInAt) ? "warn" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Accounts">
            {users.length === 0 ? (
              <EmptyState title="No accounts yet" />
            ) : (
              <ul className="divide-y divide-line">
                {users.map((user) => {
                  const toggle = setUserActive.bind(null, user.id, !user.isActive);
                  return (
                    <li key={user.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {user.name || user.email}
                            {user.isAdmin ? (
                              <Badge tone="brand" className="ml-2">
                                Administrator
                              </Badge>
                            ) : null}
                            {!user.isActive ? (
                              <Badge tone="bad" className="ml-2">
                                Disabled
                              </Badge>
                            ) : null}
                            {user.mustChangePassword ? (
                              <Badge tone="warn" className="ml-2">
                                Temporary password
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted">
                            {user.email} ·{" "}
                            {user.lastSignInAt
                              ? `last signed in ${formatDate(user.lastSignInAt)}`
                              : "never signed in"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ResetButton userId={user.id} />
                          {user.id !== me.id ? (
                            <form action={toggle}>
                              <button type="submit" className="btn-ghost text-xs">
                                {user.isActive ? "Disable" : "Enable"}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>

                      {user.isAdmin ? (
                        <p className="mt-2 text-xs text-muted">
                          Reaches every campaign by virtue of being an administrator.
                        </p>
                      ) : (
                        <div className="mt-2">
                          {user.access.length === 0 ? (
                            <p className="text-xs text-accent-ink">
                              No campaign access — grant one below.
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {user.access.map((a) => {
                                const revoke = revokeAccess.bind(null, a.id);
                                return (
                                  <li
                                    key={a.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raise px-2.5 py-1.5 text-xs"
                                  >
                                    <span>
                                      <strong>{a.campaign.candidateName}</strong>{" "}
                                      <span className="text-muted">
                                        {a.campaign.municipality.name} ·{" "}
                                        {ROLES[a.role as Role] ?? a.role}
                                      </span>
                                    </span>
                                    <form action={revoke}>
                                      <button type="submit" className="text-muted underline">
                                        Remove
                                      </button>
                                    </form>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          <form action={grantAccess} className="mt-2 flex flex-wrap gap-2">
                            <input type="hidden" name="userId" value={user.id} />
                            <select name="campaignId" className="field w-56 text-xs" required>
                              <option value="">Grant access to…</option>
                              {campaignOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            <select name="role" defaultValue="OWNER" className="field w-44 text-xs">
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="btn-secondary text-xs">
                              Grant
                            </button>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Who can see what" description="A quick read across every campaign.">
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Municipality</Th>
                  <Th>People with access</Th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const holders = users.filter(
                    (u) => u.isAdmin || u.access.some((a) => a.campaignId === campaign.id),
                  );
                  return (
                    <tr key={campaign.id}>
                      <Td className="font-medium">{campaign.candidateName}</Td>
                      <Td className="text-muted">{campaign.municipality.name}</Td>
                      <Td className="text-muted">
                        {holders.map((h) => h.name || h.email).join(", ")}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Add someone">
            <NewMemberForm campaigns={campaignOptions} />
          </Card>

          <Card title="Roles">
            <dl className="space-y-2 text-sm">
              {ROLE_OPTIONS.map((r) => (
                <div key={r.value}>
                  <dt className="font-medium">{r.value.toLowerCase()}</dt>
                  <dd className="text-xs text-muted">{r.label}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">
              Finance and texting need manager or candidate. Contribution limits
              and consent records are not a canvasser&apos;s business, and a
              mistaken entry in either is a compliance problem.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
