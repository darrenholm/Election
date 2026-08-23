# Municipal Election Campaign Manager

A single application for running a municipal election campaign: the voter file
and canvassing, the volunteer roster and shift schedule, campaign finance with
Ontario compliance checks built in, and the lawn-sign operation.

Built for a candidate in an **Ontario** municipal election. The finance module
encodes the *Municipal Elections Act, 1996* — contribution limits, the spending
limit formula, the self-funding ceiling and the Form 4 expense taxonomy.

## What it does

### Voters and canvassing
- Import the clerk's voters' list from CSV, with column mapping and a preview.
  Re-importing an updated list refreshes existing records instead of
  duplicating them, so the support levels you have collected survive.
- Voters are grouped into **households** by normalised address, so canvassers
  work a door rather than a person.
- Search and filter the file by name, phone, street, ward, support level, or
  one of the named slices a campaign asks for constantly — not yet identified,
  supporters, wants a sign, offered to volunteer, do not contact.
- **Turf** is a bundle of streets handed to one canvasser. The walk list sorts
  down each street in civic-number order and prints cleanly.
- Logging a contact at the door rolls its outcome up onto the voter: the
  support level, a sign promise (which creates a sign request automatically), an
  offer to volunteer, a move or a death.

### Volunteers and shifts
- Roster with roles, availability, vehicle and status.
- Voters who said yes at the door surface as recruits, one click from the
  roster.
- Shifts with capacity, sign-ups, confirmation, check-in and logged hours.
  Unfilled seats are visible everywhere so they can be chased.

### Finance and Ontario compliance
- Contribution entry runs the Act's rules **as you type**: the per-contributor
  limit, the candidate-and-spouse self-funding ceiling, the cash rule, the
  anonymity rule, contributor eligibility, and whether a receipt has been
  issued.
- The same rules run again over the whole ledger on every finance page load, so
  a problem introduced by a later edit is caught too — not only at entry.
- Expenses are categorised on the ministry's own Form 4 lines, which decides
  whether each one counts against the spending limit.
- Live tracking against all three limits: the general spending limit, the
  separate appreciation-party limit, and self-funding.
- In-kind contributions automatically create the matching expense, because the
  Act counts fair market value on both sides of the ledger.
- A **Form 4 worksheet** lays your books out box by box (A, B, C, D, Schedule 1,
  Schedule 2) for transcription onto the filing, plus CSV exports for the
  bookkeeper and auditor.

### Map and geography
- A map of the whole operation: doors knocked coloured by support level, doors
  not yet reached, upcoming canvass routes drawn street by street in walk order,
  and every lawn sign — installed or waiting on the crew.
- Tiles come from OpenStreetMap and need no account. Google is used only to turn
  addresses into coordinates, and often not even for that (see below).
- Addresses the geocoder could only place roughly — common on concession roads
  and rural routes — are outlined so they can be checked, and any of them can be
  pinned by hand. A hand-placed pin is never overwritten by a later run.

### Loading addresses
- The civic address importer loads every door in the municipality, with
  coordinates. **Statistics Canada's Open Database of Addresses** publishes this
  per province under an open licence, and most Ontario county GIS portals
  publish address points too. If the file has latitude and longitude — these
  generally do — no geocoding is needed at all and the whole Google step is
  moot.
- **Feed it the whole province.** Ontario's file is a single CSV of several
  hundred megabytes covering every municipality. The importer streams it in
  pieces rather than reading it into memory, scans it for the municipalities it
  contains, and loads only the ones you tick — so there is no need to split the
  file up beforehand. Tested on a 600,000-row file: the scan took seconds and
  nothing outside the chosen municipality was imported.
- Load addresses first, then the clerk's voters' list when it arrives. The
  voters' list then attaches people to doors that already exist rather than
  creating a second set of them.
- Streets are matched on a normalised key, so `YONGE ST S` from an address file
  and `Yonge Street South` from a voters' list land on the same door. Postal code
  is deliberately not part of the match, because civic address files usually have
  none. Later imports fill gaps — a postal code from the voters' list, coordinates
  from the address file — but never overwrite what is already there.

### Street coverage
- Door counts per street with coverage: how many doors, how many knocked, how
  many identified, and the street's average lean. Sortable by least-covered, so
  the question "where does the next canvass go" has an answer on one screen.

### On a phone at the door
- Installable to a phone's home screen. Contact logging, the walk list and the
  consent script all work one-handed.
- **Patchy signal is handled.** Every contact is written to a local queue on the
  phone before it is sent, and only cleared once the server confirms it. In a
  dead zone the canvasser is told it is held, not lost; it uploads on its own
  when coverage returns. Each entry carries an id generated on the device, so
  retries can never record the same door twice.
- Walk lists are deliberately *not* cached offline. A cached list is stale data,
  and a canvasser knocking from yesterday's support levels does real damage —
  so what survives a dead zone is the outbox, not the list.

### Text messages
- Consent is captured at the door with the exact wording read to the voter, and
  stored with it. The consent register shows who agreed, when, and through what
  script.
- Audiences can only ever contain voters who gave express consent, have a usable
  number, and have not opted out. That is enforced at send time, not just in the
  audience builder — consent is re-checked for every message as it goes.
- The composer shows the recipient count, the real segment count and the
  estimated cost before anything sends, and names the characters that pushed the
  message into the expensive encoding.
- A `STOP` reply blocks that number permanently, in its own table keyed by phone
  rather than as a flag on a voter row, so an opt-out survives edits, imports and
  merges. Twilio's webhooks are signature-verified and sit outside the password
  gate, because an opt-out bounced to a login page is an opt-out that never
  happened.
- With no Twilio credentials the whole pipeline runs in dry-run mode, so a send
  can be rehearsed end to end before an account exists.

### Lawn signs and events
- Requests move through requested → approved → scheduled → installed → removed,
  with permission tracking and a per-type inventory that shows what is left in
  the garage — and warns when more signs have been promised than exist.
- Printable install and retrieval run sheets, grouped by ward.
- Events, with fundraisers linked to their contributions and costs so
  Schedule 2 fills itself in.

## A necessary caveat on the compliance features

**This is a bookkeeping aid, not legal or accounting advice.** The clerk of the
municipality issues the certified spending limit, and the filed Form 4 — with an
auditor's report where the Act requires one — is what governs. Every figure the
app calculates is an estimate to keep the campaign inside the lines day to day.

Enter the clerk's certified figures in **Settings** as soon as you receive them;
they override the calculated ones everywhere in the app.

The rules encoded, and where they come from:

| Rule | Section | Value |
| --- | --- | --- |
| Per-contributor limit | s. 88.9.1 | $1,200 to any one candidate |
| Aggregate limit, same council | s. 88.9.1 | $5,000 — shown as a note; the app cannot see other campaigns |
| Candidate + spouse self-funding | s. 88.9.2 | base + $0.20/elector, capped at $25,000 |
| General spending limit | s. 88.20 | $7,500 (head of council) or $5,000 (other offices) + $0.85/elector |
| Appreciation-party limit | s. 88.21 | 10% of the general limit |
| Cash | s. 88.9 | contributions over $25 must not be cash |
| Anonymity | s. 88.9 | only $25 or less, taken at a fundraising function |
| Itemisation on Form 4 | Schedule 1 | contributors totalling over $100 |

Only individuals normally resident in Ontario may contribute; corporations and
trade unions have been prohibited since 2018.

## Getting started

Needs Node 20.9 or newer and a PostgreSQL database. The quickest route is to
create the Railway Postgres first (see Deploying) and point local development at
its public connection string — one database, no divergence between what you test
and what you ship.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # on Windows PowerShell: copy .env.example .env
# put your DATABASE_URL in .env, then:
npm run db:deploy           # create the tables
npm run db:seed             # optional: load a six-candidate demo
npm run dev
```

Then open http://localhost:3000.

> **Windows PowerShell 5.1** — the version that ships with Windows — does not
> accept `&&` between commands. Run each line on its own. PowerShell 7 and Git
> Bash both handle `&&` fine.
>
> `npm install` prints a deprecation warning for ESLint and reports high
> severity advisories. Both come from build-time dev dependencies (the Prisma
> CLI's config loader), not from anything the running app serves. Do not run
> `npm audit fix --force` — it downgrades Prisma and breaks the schema.

The demo loads two municipalities and six candidates — one running for head of
council in a ward-based municipality, five in a municipality that elects at
large. It is worth clicking between them: the doors are shared, the support
levels and consent are not.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Generate the Prisma client and build for production |
| `npm run start` | Apply migrations, then run the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run db:deploy` | Apply migrations to the database |
| `npm run db:migrate` | Create a new migration after a schema change |
| `npm run db:seed` | Load the demo campaigns |
| `npm run db:studio` | Prisma Studio, for poking at the data directly |

## Accounts and who sees what

Each person signs in with their own account, and reaches only the campaigns
granted to them. Five candidates in one town share the address file and the
voters' list; they never see each other's support levels, contacts, donors or
consent records.

- The **first visit** to a fresh install opens a one-time setup page that creates
  the administrator — you, the person running the campaigns. That page stops
  working the moment an account exists.
- **Team** (administrators only) creates accounts and grants campaign access.
  New accounts get a temporary password, shown once, and must change it at first
  sign-in. There is no email sending, so read it out or message it.
- Roles: **candidate** (full control including finance), **manager** (everything
  but deleting the campaign), **canvasser** (voters and canvassing only, no
  finance or texting), **viewer** (read only).
- The active-campaign cookie is a preference, not a permission. Whatever it
  names, the campaign is only served if the account actually has access — so
  editing it cannot reach a rival's data.

- Server actions are treated as public endpoints. Anything handed a record id
  resolves that record's campaign and re-checks the caller against it, in
  `src/lib/guard.ts` — hiding a page is not access control, and an id is not a
  permission.

Passwords are hashed with scrypt from Node's standard library. Sessions are
signed cookies with no server-side store; rotating `SESSION_SECRET` invalidates
every session at once, which is the lever to pull if something goes wrong.
`SESSION_SECRET` must be set in production: the development fallback is in this
repository, and the app refuses to serve rather than sign cookies with it.

## Slates

If a group of candidates decide to run together, an administrator can create a
**slate** on the campaigns page and add them to it.

Sharing is **reciprocal and off by default**: a campaign sees its slate-mates'
canvass notes and support levels only while it is sharing its own. Nobody reads
the slate without contributing to it.

Two things are never shared, whatever the slate agrees, and the code enforces it
rather than trusting the setting:

- **Text-message consent**, because it is given to a named sender and cannot be
  transferred to another candidate.
- **Anything financial**, because each candidate has their own contribution
  limits and files their own Form 4.

Shared notes appear on the voter's page under "From the slate", attributed to
the candidate who recorded them — a canvasser needs to know whose conversation
they are reading.

## Running several candidates

The app is built for a consultant running more than one campaign at once.

- **Municipalities own the doors and the electors.** Every candidate running in
  the same town works from one address file and one voters' list, loaded once.
- **Campaigns own everything they learn.** Support levels, text consent,
  contacts, volunteers, money, signs and messages are all scoped to one
  candidate. A voter friendly to one is not thereby friendly to another, and
  consent to be texted is given to a named sender rather than to whoever holds
  the list — so each campaign needs its own sending number, set in Settings.
- The switcher at the top of the sidebar changes which campaign you are working
  on. It is deliberately prominent: entering a contribution against the wrong
  candidate is a compliance problem, not a cosmetic one.
- Deleting an elector removes them from the municipal file for *every* campaign
  in that town. "Do not contact" is per campaign and is almost always what you
  want instead.

## Deploying to Railway

The batch work in this app — geocoding runs, SMS sends — happens inside request
handlers, which suits a persistent server better than serverless functions with
execution caps. Railway gives you that plus Postgres in one place.

1. **New Project → Deploy from GitHub repo**, and pick this repository and
   branch.
2. **Add a Postgres service**: *New → Database → Add PostgreSQL*.
3. On the app service, open **Variables** and set:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference it, do not paste it |
   | `SESSION_SECRET` | 32+ random characters, e.g. from `openssl rand -hex 32`. **Required — the app refuses to serve without it.** |
   | `APP_URL` | your Railway URL, e.g. `https://campaign.up.railway.app` |
   | `GOOGLE_GEOCODING_API_KEY` | only if your address file has no coordinates |
   | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | only when you are ready to send texts |

4. **Generate a domain** under Settings → Networking, and put it in `APP_URL`.
5. Deploy. `npm run start` runs `prisma migrate deploy` first, so the schema is
   created and kept current on every release — no manual migration step.

Point Twilio's webhooks at `https://your-app/api/sms/webhook` (inbound) and
`https://your-app/api/sms/status` (delivery). Both sit outside the sign-in gate
and verify Twilio's request signature instead.

## How the code is laid out

```
prisma/
  schema.prisma        Data model — 12 models, money as integer cents
  seed.ts              Fictional demo campaign
src/
  lib/
    ontario.ts         The Act's rules: limits, categories, contribution checks
    consent.ts         Consent wording, phone normalisation, SMS segment counting
    sms.ts             Twilio sending, audience building, the three send-time rules
    geocode.ts         Google geocoding with precision tracking
    map-data.ts        Every point the map draws
    outbox.ts          The canvasser's offline queue
    address.ts         Address and street-name normalisation for cross-source matching
    finance.ts         Aggregations shared by the finance pages and Form 4
    enums.ts           Value sets for every String-backed column, plus labels
    campaign.ts        The singleton campaign row and its computed limits
    form.ts            FormData readers used by every server action
    money.ts           Cents parsing and formatting
    csv.ts             CSV writing for the exports
    auth.ts            Shared-password gate
  app/
    actions/           Server actions, one module per domain
    voters/  canvass/  volunteers/  shifts/  finance/  signs/  events/
  components/          Shared UI primitives and forms
```

Two conventions worth knowing:

- **Money is always integer cents.** `parseCents` reads user input; `formatCents`
  writes it back out. No float ever touches an amount.
- **`src/lib/ontario.ts` is the only place the Act is encoded.** The entry form
  and the standing audit call the same `checkContribution`, which is why what
  the form warns about at entry is exactly what the finance page flags
  afterwards.
- **Consent rules live in `src/lib/sms.ts`, not in the UI.** The audience
  builder, the send loop and the opt-out list all enforce them, so a mistake in
  a screen cannot result in an unlawful message.

## Stack

Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4,
Prisma 6 with SQLite, Leaflet for mapping, Twilio for text messaging.
