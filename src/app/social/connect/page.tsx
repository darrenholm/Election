import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCampaign } from "@/lib/guard";
import { FACEBOOK_HANDOFF_COOKIE, listPages } from "@/lib/facebook";
import { readSignedValue } from "@/lib/session";
import { connectPage } from "@/app/actions/social";
import { Card, Note, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Which Page to post as.
 *
 * Only reached when the account administers more than one — a candidate who
 * also runs a business Page, most often. The half-finished connection lives in
 * a signed cookie that expires in a quarter of an hour, and the Page list is
 * fetched here rather than carried through the browser.
 */
export default async function ConnectPage() {
  const jar = await cookies();
  const claim = readSignedValue(jar.get(FACEBOOK_HANDOFF_COOKIE)?.value);
  if (!claim) redirect("/social?connect=state");

  const separator = claim.indexOf(":");
  const campaignId = claim.slice(0, separator);
  const userToken = claim.slice(separator + 1);

  if (!(await requireCampaign(campaignId, "MANAGER"))) redirect("/social?connect=forbidden");

  const pages = await listPages(userToken);
  if (!pages.ok) redirect("/social?connect=pages");
  if (pages.pages.length === 0) redirect("/social?connect=nopages");

  return (
    <>
      <PageHeader title="Which Page?" subtitle="This account administers more than one." />

      <div className="max-w-lg">
        <Card title="Post as">
          <form action={connectPage} className="space-y-3">
            {pages.pages.map((page, index) => (
              <label
                key={page.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <input
                  type="radio"
                  name="pageId"
                  value={page.id}
                  defaultChecked={index === 0}
                  className="size-4"
                  required
                />
                <span>
                  <span className="block text-sm font-medium">{page.name}</span>
                  <span className="block text-xs text-muted">{page.id}</span>
                </span>
              </label>
            ))}

            <button type="submit" className="btn-primary w-full">
              Connect this Page
            </button>
          </form>

          <div className="mt-3">
            <Note>
              Pick the campaign Page, not a personal profile. Everything the app
              posts goes out under this name, and the choice can be changed
              later by disconnecting and connecting again.
            </Note>
          </div>
        </Card>
      </div>
    </>
  );
}
