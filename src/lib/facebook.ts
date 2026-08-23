/**
 * Posting to a candidate's Facebook Page.
 *
 * The split mirrors texting: the Meta app's own credentials live in the
 * environment and belong to whoever runs the install, while the Page and its
 * access token are stored per campaign. Each candidate posts in their own
 * name, and one of them disconnecting must not silence the rest.
 *
 * With no app configured — which is every install until Meta has reviewed it —
 * the whole pipeline still runs and marks posts as a dry run. A campaign can
 * plan its entire feed, write every draft and see exactly what would go out
 * before anyone opens a developer account. That is deliberate: app review
 * takes weeks, and an election does not wait for it.
 */

/** Short-lived cookie that carries a half-finished connection to the picker. */
export const FACEBOOK_HANDOFF_COOKIE = "facebook_handoff";

const GRAPH_HOST = "https://graph.facebook.com";
const DIALOG_HOST = "https://www.facebook.com";

/**
 * Publishing to a Page needs all three. pages_show_list is what lets the
 * candidate pick which Page; pages_read_engagement is what makes the published
 * post readable afterwards, so a failed post can be told from a silent one.
 */
export const FACEBOOK_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

export type FacebookConfig = {
  configured: boolean;
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
};

export function facebookConfig(): FacebookConfig {
  const appId = process.env.FACEBOOK_APP_ID ?? "";
  const appSecret = process.env.FACEBOOK_APP_SECRET ?? "";
  const graphVersion = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  return {
    configured: Boolean(appId && appSecret),
    appId,
    appSecret,
    graphVersion,
    // Meta matches this against the redirect URI registered on the app, to the
    // character, so it is derived from APP_URL rather than typed twice.
    redirectUri: `${appUrl}/api/facebook/callback`,
  };
}

function graph(path: string): string {
  return `${GRAPH_HOST}/${facebookConfig().graphVersion}${path}`;
}

/** Where to send the candidate to authorise the app against their Page. */
export function authorizeUrl(state: string): string {
  const config = facebookConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    scope: FACEBOOK_SCOPES.join(","),
    response_type: "code",
  });
  return `${DIALOG_HOST}/${config.graphVersion}/dialog/oauth?${params}`;
}

/**
 * Graph errors come back as 200-with-an-error-body about as often as they come
 * back as a status code, so everything goes through here.
 */
async function graphRequest(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Could not reach Facebook" };
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Facebook replied ${response.status} with something that was not JSON` };
  }

  const error = body.error as { message?: string; code?: number } | undefined;
  if (error?.message) return { ok: false, error: error.message };
  if (!response.ok) return { ok: false, error: `Facebook replied ${response.status}` };

  return { ok: true, data: body };
}

/** Swap the code on the callback for a user token, then for a long-lived one. */
export async function exchangeCodeForUserToken(
  code: string,
): Promise<{ ok: true; token: string; expiresAt: Date | null } | { ok: false; error: string }> {
  const config = facebookConfig();

  const short = await graphRequest(
    graph(
      `/oauth/access_token?${new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code,
      })}`,
    ),
  );
  if (!short.ok) return short;

  const shortToken = String(short.data.access_token ?? "");
  if (!shortToken) return { ok: false, error: "Facebook returned no access token" };

  // A short-lived token expires in about an hour, which would mean reconnecting
  // every time. The exchanged one lasts about sixty days.
  const long = await graphRequest(
    graph(
      `/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortToken,
      })}`,
    ),
  );
  if (!long.ok) return long;

  const token = String(long.data.access_token ?? shortToken);
  const expiresIn = Number(long.data.expires_in ?? 0);

  return {
    ok: true,
    token,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
  };
}

export type FacebookPage = { id: string; name: string; accessToken: string };

/**
 * The Pages this person can post as. Usually one; a candidate who also runs a
 * business Page will see both, which is exactly why they get to choose rather
 * than the app taking the first.
 */
export async function listPages(
  userToken: string,
): Promise<{ ok: true; pages: FacebookPage[] } | { ok: false; error: string }> {
  const result = await graphRequest(
    graph(`/me/accounts?${new URLSearchParams({ access_token: userToken, fields: "id,name,access_token" })}`),
  );
  if (!result.ok) return result;

  const rows = Array.isArray(result.data.data) ? (result.data.data as Record<string, unknown>[]) : [];
  const pages = rows
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      accessToken: String(row.access_token ?? ""),
    }))
    .filter((page) => page.id && page.accessToken);

  return { ok: true, pages };
}

export type PublishResult =
  | { ok: true; postId: string; dryRun: boolean }
  | { ok: false; error: string };

/**
 * Put one post on a Page.
 *
 * A post with a photo goes to /photos, everything else to /feed — Graph will
 * accept a `link` on a plain feed post and unfurl it, but it will not take an
 * image that way.
 */
export async function publishToPage(
  page: { id: string; token: string },
  post: { body: string; linkUrl?: string; imageUrl?: string },
): Promise<PublishResult> {
  const config = facebookConfig();
  const message = post.body.trim();
  if (!message) return { ok: false, error: "Nothing to post" };

  // No app, or no Page connected: report what would have happened rather than
  // pretending to have posted. The caller records it as a dry run.
  if (!config.configured || !page.id || !page.token) {
    return { ok: true, postId: "", dryRun: true };
  }

  const usePhoto = Boolean(post.imageUrl);
  const params = new URLSearchParams({ access_token: page.token });
  if (usePhoto) {
    params.set("url", post.imageUrl!);
    params.set("caption", message);
  } else {
    params.set("message", message);
    if (post.linkUrl) params.set("link", post.linkUrl);
  }

  const result = await graphRequest(graph(`/${page.id}/${usePhoto ? "photos" : "feed"}`), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!result.ok) return result;

  // A photo post answers with both; post_id is the one that addresses the
  // story on the Page, which is what a link back should point at.
  const postId = String(result.data.post_id ?? result.data.id ?? "");
  if (!postId) return { ok: false, error: "Facebook accepted the post but named no id for it" };

  return { ok: true, postId, dryRun: false };
}

/** The public address of a published post, for the link back to Facebook. */
export function postUrl(providerPostId: string): string {
  if (!providerPostId) return "";
  // Graph returns "{pageId}_{postId}", which is also the path Facebook serves.
  const [pageId, storyId] = providerPostId.split("_");
  if (!storyId) return `https://www.facebook.com/${providerPostId}`;
  return `https://www.facebook.com/${pageId}/posts/${storyId}`;
}
