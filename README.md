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

Needs Node 20.9 or newer. Run these one at a time, in order:

```bash
npm install          # also generates the Prisma client
cp .env.example .env # on Windows PowerShell: copy .env.example .env
npm run db:push      # create the SQLite database from the schema
npm run db:seed      # optional: load a fictional demo campaign
npm run dev
```

Then open http://localhost:3000.

> **Windows PowerShell 5.1** — the version that ships with Windows — does not
> accept `&&` between commands. Run each line on its own rather than chaining
> them. PowerShell 7 and Git Bash both handle `&&` fine.
>
> `npm install` prints a deprecation warning for ESLint and reports high
> severity advisories. Both come from build-time dev dependencies (the Prisma
> CLI's config loader), not from anything the running app serves. Do not run
> `npm audit fix --force` — it downgrades Prisma and breaks the schema.

The demo campaign includes deliberate compliance problems — an over-limit
contributor, a cash gift above $25, a contributor with no address on file — so
you can see what the finance page does when things are not green.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Generate the Prisma client and build for production |
| `npm run start` | Run the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run db:push` | Sync the schema to the database |
| `npm run db:seed` | Load the demo campaign |
| `npm run db:reset` | Wipe and reload |
| `npm run db:studio` | Prisma Studio, for poking at the data directly |

## Configuration

Copy `.env.example` to `.env`:

```
DATABASE_URL="file:./dev.db"
APP_PASSWORD=""
```

### Access control — read this before deploying

The database holds electors' names, home addresses and phone numbers. Setting
`APP_PASSWORD` puts a shared password in front of the whole application; leaving
it blank runs the app **unauthenticated**, which is reasonable on your own
laptop and unsafe anywhere else. The dashboard shows a banner whenever no
password is set.

The session cookie carries a SHA-256 digest rather than the password itself, and
changing `APP_PASSWORD` signs everyone out.

This is one shared password for the whole team, not per-user accounts. It is
deliberately simple, and it is not an audit trail: it tells you that someone
from the campaign made a change, not who.

### Voters' list handling

The municipal voters' list may only be used for election purposes. Keep it
inside the campaign, and delete the data when the campaign period ends. The
`.gitignore` excludes `*.db` so a database full of voter data cannot be
committed by accident.

## Deploying

SQLite is the default because it needs no setup. For a shared deployment, move
to Postgres:

1. Change `provider` to `"postgresql"` in `prisma/schema.prisma`.
2. Point `DATABASE_URL` at your server.
3. `npx prisma migrate dev --name init`.

Nothing in the schema is SQLite-specific. Enum-like columns are stored as
strings because the SQLite connector has no native enums; the allowed values
live in `src/lib/enums.ts` and are validated before every write.

Set `APP_PASSWORD` in the deployment environment.

## How the code is laid out

```
prisma/
  schema.prisma        Data model — 12 models, money as integer cents
  seed.ts              Fictional demo campaign
src/
  lib/
    ontario.ts         The Act's rules: limits, categories, contribution checks
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

## Stack

Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4,
Prisma 6 with SQLite.
