import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwned } from "@/lib/guard";
import { POST_KINDS, POST_KIND_OPTIONS, POST_STATUSES, label } from "@/lib/enums";
import { formatDateTime, toDateTimeInput } from "@/lib/dates";
import { postUrl } from "@/lib/facebook";
import { deletePost, publishPost, setPostStatus, updatePost } from "@/app/actions/social";
import { Badge, Card, Field, Note, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

/** One post: rewrite it, approve it, or put it out now. */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The id comes off the URL, so the campaign is resolved from the record and
  // the caller checked against it — a post id is not a permission.
  if (!(await requireOwned("socialPost", id, "MANAGER"))) notFound();

  const post = await db.socialPost.findUnique({
    where: { id },
    include: { campaign: { select: { facebookPageName: true, facebookPageId: true } } },
  });
  if (!post) notFound();

  const save = updatePost.bind(null, post.id);
  const approve = setPostStatus.bind(null, post.id, "APPROVED");
  const unapprove = setPostStatus.bind(null, post.id, "DRAFT");
  const skip = setPostStatus.bind(null, post.id, "SKIPPED");
  const remove = deletePost.bind(null, post.id);
  const publishNow = async () => {
    "use server";
    await publishPost(post.id);
    redirect(`/social/${post.id}`);
  };

  const posted = post.status === "PUBLISHED";
  const link = postUrl(post.providerPostId);

  return (
    <>
      <PageHeader
        title={label(POST_KINDS, post.kind)}
        subtitle={formatDateTime(post.scheduledFor)}
        actions={
          <Link href="/social" className="btn-secondary">
            Back to the schedule
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title={posted ? "What went out" : "The post"}
            actions={<Badge tone={posted ? "good" : "neutral"}>{label(POST_STATUSES, post.status)}</Badge>}
          >
            {posted ? (
              <>
                <p className="whitespace-pre-line text-sm">{post.body}</p>
                <div className="mt-3 text-xs text-muted">
                  {post.dryRun ? (
                    <Note tone="warn">
                      This was a dry run — nothing reached Facebook. It is
                      recorded so the schedule stays honest about what was
                      planned and when.
                    </Note>
                  ) : link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="underline">
                      See it on Facebook
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <form action={save} className="space-y-3">
                <Field
                  label="What it says"
                  hint="The square brackets are blanks left for you. A post that reads like it came out of a machine is worse than no post."
                >
                  <textarea
                    name="body"
                    defaultValue={post.body}
                    rows={12}
                    className="field font-normal"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Kind">
                    <Select name="kind" options={POST_KIND_OPTIONS} defaultValue={post.kind} />
                  </Field>
                  <Field label="When">
                    <input
                      type="datetime-local"
                      name="scheduledFor"
                      defaultValue={toDateTimeInput(post.scheduledFor)}
                      className="field"
                    />
                  </Field>
                </div>

                <Field label="Link" hint="Facebook will unfurl it below the text.">
                  <input name="linkUrl" defaultValue={post.linkUrl} className="field" placeholder="https://" />
                </Field>

                <Field
                  label="Photo"
                  hint="A public image address. A post with a photo goes out as a photo post."
                >
                  <input name="imageUrl" defaultValue={post.imageUrl} className="field" placeholder="https://" />
                </Field>

                <button type="submit" className="btn-primary">
                  Save the draft
                </button>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {!posted ? (
            <Card title="When it is ready">
              <p className="text-xs text-muted">
                Approving does not post it. The schedule posts what is approved
                once its time has come, next time somebody opens the section.
              </p>
              <div className="mt-3 space-y-2">
                {post.status === "APPROVED" ? (
                  <form action={unapprove}>
                    <button type="submit" className="btn-secondary w-full">
                      Put it back to draft
                    </button>
                  </form>
                ) : (
                  <form action={approve}>
                    <button type="submit" className="btn-primary w-full">
                      Approve for {formatDateTime(post.scheduledFor)}
                    </button>
                  </form>
                )}

                <form action={publishNow}>
                  <button type="submit" className="btn-secondary w-full">
                    Post it now
                  </button>
                </form>

                <form action={skip}>
                  <button type="submit" className="btn-ghost w-full text-xs">
                    Skip this slot
                  </button>
                </form>
              </div>

              {post.errorMessage ? (
                <div className="mt-3">
                  <Note tone="bad">{post.errorMessage}</Note>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card title="Where it goes">
            {post.campaign.facebookPageId ? (
              <p className="text-sm">{post.campaign.facebookPageName || post.campaign.facebookPageId}</p>
            ) : (
              <Note tone="warn">
                No Page is connected, so posting records a dry run instead of
                reaching Facebook.
              </Note>
            )}
          </Card>

          <Card title="Remove">
            <form action={remove}>
              <button type="submit" className="btn-ghost text-xs">
                Delete this post
              </button>
            </form>
            <p className="mt-1 text-xs text-muted">
              Skipping keeps the slot in the record; deleting takes it out
              altogether.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
