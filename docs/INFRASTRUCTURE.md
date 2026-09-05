# Where this thing actually lives

Written down because working it out took a morning, and it should not have to
be worked out again. Each fact says how it was established, so a reader who
doubts it can check rather than trust — and so a fact that goes stale can be
spotted rather than believed.

Last established: 5 September 2026.

## The short version

**One Next.js app and one Postgres database, both on Railway. Cloudflare answers
DNS. Nothing else is involved.**

Supabase, WHC hosting and Vercel all appear in the wider business and none of
them serve this app. If a conversation starts sprawling across providers again,
that sentence is the answer.

## One app, two halves

The same deployment serves two audiences, split by route group:

| Route | Who it is for | Behind sign-in? |
| --- | --- | --- |
| `/` and most paths | The campaign manager — voters, canvassing, finance, signs | Yes, campaign accounts |
| `/election/*` | The print portal — candidates ordering signs and print | No. Its own customer accounts |
| `/shop`, `/shop/[id]` | The shop's order queue | Yes, administrators only |
| `/api/shop/*` | Artwork files and the handoff link | Own checks, outside the gate |

`src/proxy.ts` decides what is behind the gate. The route groups are
`src/app/(app)` and `src/app/(portal)`; both sit under one root layout.

## Hosting

- **Railway** runs the app and the Postgres. The app service deploys the
  repository's **default branch, which is `claude/municipal-election-campaign-app-e1x98u`
  — not `main`.** `main` exists and is not what ships. This has caught us out
  once; check before assuming.
  *Established:* `git ls-remote --symref origin HEAD`, and the GitHub
  deployments panel showing `electionmgr.ca / production` active.
- **Deploys are automatic** on a push to that branch. `railway.json` sets the
  start command to `npm run start`, which runs `prisma migrate deploy` **before**
  the server starts, so migrations apply themselves on release. Health check is
  `/api/health` with a 120-second grace.
- **The database is the Railway Postgres** in the same project, referenced as
  `${{Postgres.DATABASE_URL}}` rather than pasted.

### What is *not* the database

The Supabase project **holm-graphics** is not this app's database. Its dashboard
shows **"LAST MIGRATION: No migrations"**, and this app has had migrations since
its first release — Prisma has never run there. It belongs to other Holm
Graphics work. Do not point this app at it.

If it ever were used, note that Prisma's `migrate deploy` needs Supabase's
**direct** connection on port 5432, not the pooler on 6543.

## Domains and DNS

- **holmgraphics.ca** — registered at **WHC**, but its nameservers are
  **Cloudflare** (`grant.ns.cloudflare.com`, `shubhi.ns.cloudflare.com`). DNS
  records are added in Cloudflare. WHC hosts the existing marketing website and
  has nothing to do with this app.
- **electionmgr.ca** — the campaign manager, live on the Railway service.
- A second domain for the storefront is optional. Both halves are one app, so
  one service can carry both domains; `PORTAL_HOST` decides which one opens the
  storefront at its root instead of a sign-in page.

## Environment variables that matter

Full list with commentary in `.env.example`. The ones with traps:

| Variable | Trap |
| --- | --- |
| `DATABASE_URL` | Reference `${{Postgres.DATABASE_URL}}`; pasting it breaks when Railway rotates credentials |
| `SESSION_SECRET` | The app refuses to serve in production without it. Rotating it signs everybody out, which is the lever to pull if something leaks |
| `APP_URL` | **The Facebook OAuth redirect URI is built from this.** Changing it breaks Page connections. Leave it on the campaign manager's domain |
| `PORTAL_URL` | The storefront's own domain, used to build the handoff link. Exists *because* `APP_URL` must not move |
| `PORTAL_HOST` | The hostname whose root redirects to `/election`. Unset, nothing changes |

## Outside services, and what happens without them

Every one of these is designed to run in **dry-run** when unconfigured, so the
app works end to end before an account exists. That is deliberate and worth
preserving in anything new.

| Service | For | Adapter | Without credentials |
| --- | --- | --- | --- |
| Twilio | Texting | `src/lib/sms.ts` | Sends are rehearsed, nothing goes out |
| Meta | Facebook posting | `src/lib/facebook.ts` | Plan and drafts work, publishing records what would have gone |
| SinaLite | Trade printing — cards, hangers | `src/lib/shop/sinalite.ts` | Quotes marked dry-run; jobs are placed by hand in the queue instead |
| SanMar | Garment costs, colours, sizes | `src/lib/shop/sanmar.ts` | Data comes in from a CSV export instead |
| Google | Geocoding | `src/lib/geocode.ts` | Not needed when the address file carries coordinates |

## Adding something — the checks that catch mistakes

```
npm run typecheck        TypeScript
npm run lint             ESLint
npm run build            the real build
npm run sinalite:check   catalogue and trade-printer map still agree
```

`sinalite:check` needs no credentials and no network. Run it after touching the
catalogue: it catches a product in one file and not the other, a quantity the
storefront sells that the printer cannot make, an option with no counterpart.

## Running it locally, including in a container

A real Postgres and the real app, which is how the portal was verified:

```bash
# Postgres cannot run as root; give it a user of its own
useradd -m pg && mkdir -p /tmp/pgdata && chown pg /tmp/pgdata
su pg -c '/usr/lib/postgresql/16/bin/initdb -D /tmp/pgdata -U postgres --auth=trust'
su pg -c '/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -o "-p 5433 -k /tmp" start'
psql -h 127.0.0.1 -p 5433 -U postgres -c 'create database election;'

export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/election"
export SESSION_SECRET="something-at-least-16-characters"
npx prisma migrate deploy && npm run build && npx next start -p 3100
```

Driving it with Playwright in a container: the pre-installed browser is a build
behind whatever `npm i playwright` fetches, so launch with an explicit path
rather than downloading another:

```js
chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
```

## Things that have confused us before

- **The default branch is not `main`.** See above.
- **`/shop` is this app's order queue**, not a SanMar or supplier portal. The
  name collides with how a print shop talks.
- **`api.holmgraphics.ca` is a different Railway service** (`holmgraphics-shop-api`).
  Adding domains or variables there does nothing for this app.
- **A sandbox that cannot reach a supplier proves nothing about production.**
  The deployed app has ordinary internet access; the development container does
  not. Probe from Railway (`railway run npm run sanmar:probe`) before concluding
  an integration is impossible.
