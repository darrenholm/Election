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

### Facebook
- A **posting plan** rather than a scheduler you have to feed. Set the cadence
  once — which days, what time, and how much to step it up in the closing weeks
  — and the app lays out every slot between now and voting day, each one already
  carrying a draft.
- The plan says how often, in words, at the top of the page: "3 posts a week —
  Monday, Wednesday and Friday at 5pm, stepping up to 6 a week for the last 2
  weeks. That is 34 posts between now and Oct 26, 2026."
- The drafts are deliberately unfinished. Every one has blanks in square
  brackets — a street, a name, the reason you are running — because a post that
  reads like it came out of a machine is worse than no post, and nothing goes
  out until a human has approved it.
- The introduction goes first, get-out-the-vote is reserved for the closing
  week, and the rest rotate through whichever kinds are ticked. Changing the
  cadence redraws the schedule but never touches a slot that has been edited,
  approved, posted or skipped.
- Each candidate connects **their own Page**; the Meta app's credentials live in
  the environment, the Page and its token per campaign. Posting is
  manager-and-up, the same bar as texting and the money, because it speaks in
  the candidate's name.
- With no Meta app configured the whole pipeline runs in dry-run mode, so the
  plan and the drafts work before any developer account exists.
- **App Review is not the gate people expect.** `pages_manage_posts` works
  without review for anyone holding a role on the Meta app — admin, developer or
  tester — posting to a Page they administer. For a slate of candidates, add
  each to the app as a tester and they can connect their own Page immediately.
  Review is what lets people with *no* role on the app connect theirs.

### Lawn signs and events
- Requests move through requested → approved → scheduled → installed → removed,
  with permission tracking and a per-type inventory that shows what is left in
  the garage — and warns when more signs have been promised than exist.
- Printable install and retrieval run sheets, grouped by ward.
- Events, with fundraisers linked to their contributions and costs so
  Schedule 2 fills itself in.

### The election print portal

A second thing served from the same deployment, for a different audience.
`/election` is a shopfront for **Holm Graphics**, open to any municipal
candidate — no campaign-manager account, no sign-in to look around.

- The catalogue is **signs, post cards, door hangers, t-shirts, hoodies and
  decals**, each with its own configurator that prices the order as it is
  changed. What the page quotes is what the server charges: both call the same
  `priceLine()`, and nothing about a price is posted from the browser.
- **Signs are priced off the sheet.** Every cut in the catalogue — 12x12,
  12x16, 16x24, 24x32, 32x48, 48x48 and the full 4' x 8' — divides a sheet
  exactly, so the price of a sign is the price of the sheet divided by the
  yield. Thickness and printed sides are one choice with one price, and every
  additional sheet an order consumes takes another 5% off the whole order, to a
  floor of 25% at six sheets.
- Candidates get **their own accounts**, separate from the campaign manager's
  users and on their own session cookie. A print customer must never hold
  something the campaign manager would accept as a sign-in, because that side
  of the deployment holds voters' lists.
- The cart is a **draft order** rather than a table of its own, so a run priced
  on a phone at a kitchen table is still there on the laptop later, and a past
  order can be re-run in one click at today's prices.
- Artwork is optional: candidates upload print-ready files, or tick **design it
  for me** and describe what they want, for one flat fee covering the whole
  order however many pieces are on it.
- **Payment is by Interac e-transfer**, so nothing moves on its own. The order
  page names the address and puts the order number in front of the candidate to
  quote in the message; somebody at the shop sees the money arrive and records
  it.
- The shop's own queue is at `/shop`, inside the campaign manager and
  **administrators only** — the queue holds the orders of candidates running
  against each other. Delivery and any discount are set there, which is what
  turns a submitted order into a quoted one.
- Every order carries a printable receipt with the supplier, the date, what was
  bought and the tax, because campaign material is an election expense and the
  filing wants exactly that.

#### Apparel, and where garment data comes from

Shirts are not priced like print. A sign's price comes out of a sheet bought by
the sheet; a shirt's comes from SanMar's cost for that style, in that colour, in
that size — a 2XL costs more than a medium — and it changes when they change it.
So garment data lives in the database and the catalogue names only the style:
**ATC1000** for tees, **ATCF6500 / ATCF6600 / ATCF6700** for the fleece, and
**S365 / SL365** for the polos.

The shop's rule, in one place (`src/lib/shop/garments.ts`):

> retail per garment = the greater of **cost doubled** and **$12**,
> plus **$45** screen setup, once per line

The floor is what stops a cheap tee being sold for less than it costs to handle:
doubling covers the garment, but folding, boxing and answering the phone about it
do not get cheaper because the blank did. Every size is priced at its own cost,
because that is how they are bought — a run of twelve with two 2XLs costs more
than twelve mediums, and averaging would quietly lose the difference on every
order with a big size in it.

Data gets in one of two ways, and both write the same rows:

- **A CSV export from the dealer portal**, which needs no credentials and works
  today. `npm run garments:import -- export.csv --dry-run` shows what it read
  and what each garment would sell for, so a mis-picked cost column is obvious
  before anything is written; drop `--dry-run` to import. Column names are
  matched loosely, because no two exports spell them the same.
- **The SanMar API**, which is not wired. Their services are SOAP, and a SOAP
  envelope invented from memory is far likelier to be wrong than a REST body
  was, so `src/lib/shop/sanmar.ts` holds the configuration seam and lists what
  it still needs rather than shipping a call that cannot work.

The shop's queue shows which styles have data and when they were last refreshed.
Until a style has rows, apparel stays listed but not orderable.

#### What holds a sign up

Two facts of the material, both of which cost money to learn the hard way, and
both now on the product page as the choice is being made:

- A **wire stand holds a sign up to 16 × 24** and no larger. Above that the
  option is not offered at all.
- **Coroplast will not bridge between two end posts** at the larger sizes. At
  4mm it needs plywood or similar behind it; at 6mm strapping is enough, which
  usually works out cheaper than buying the plywood. The page says so the moment
  a large cut and 4mm are both selected.
- **A post-mounted sign wanting two faces is better made as two single-sided
  signs**, fixed back to back with the posts sandwiched between them: both faces
  come out clean and no hardware shows through either. The page says so when a
  large cut is chosen double-sided.

These are advice, not rules. A large 4mm sign screwed flat to a barn wall is
perfectly sound, and the portal should not refuse an order whose reason it
cannot see.

#### Taking orders before the trade printer is connected

The portal does not depend on SinaLite in any way. Nothing in the catalogue,
the cart, the checkout, the order or the e-transfer instructions calls it — the
only two places it is ever reached are two buttons in the shop's own queue. So
orders can be taken from the day the site goes up, and the trade work placed by
hand in the meantime.

The by-hand path is not a workaround to be cleaned up later. A shop takes orders
before it has credentials, and goes on placing the odd job by hand long
afterwards — an unusual stock, a rush, a line the catalogue does not carry — so
the queue supports it permanently and records which way each job went.

On a trade-printed order, with or without credentials:

1. **Type in what it cost.** Place the job on the printer's own website, then
   put each line's trade price and the freight into *What it cost, typed in*.
   That feeds the same floor and margin arithmetic as the API path, so a job
   placed by hand is exactly as legible in the queue — including the warning
   when a line was sold under cost doubled plus prep.
2. **Mark it placed**, with the reference the printer gave back and the shipping
   service. The order then reads *Placed by hand* rather than *Sent*, and the
   candidate's page behaves identically.
3. **Type in the tracking number** when their dispatch email arrives. That is
   the same by hand either way — their API has no status to poll.

Two things to know before the site goes up:

- **Nothing emails anybody when an order arrives.** The count of orders nobody
  has quoted yet is carried in the nav beside *Print orders*, in red, on every
  page — but somebody has to be looking at the app. Over a first weekend, check
  it morning and evening.
- **Prices marked provisional say so on their own product pages.** Cards,
  hangers, apparel and decals currently carry made-up figures; each page says
  the price is confirmed on the quote, which is true of every order here
  regardless. Nothing is charged until you have quoted it back, so a placeholder
  that turns out wrong costs a conversation rather than a job.

#### Trade printing through SinaLite

Post cards and door hangers are short-run offset work a small shop buys rather
than runs, so those lines are costed against **SinaLite's** trade price and, once
the candidate has paid, sent to them to print and drop-ship. Signs never go near
it — they are cut from sheets in the shop.

Their model shapes ours in three ways, and all three are visible to a candidate:

- **Every choice is an option id, including the quantity.** An order sends
  `{ "Stock": "30", "size": "4", "qty": "105", "Turnaround": "140" }` — their
  group names, their ids. So we can only sell runs they run, which is why the
  trade-printed products offer a fixed set of quantities rather than a box to
  type a number into. A quantity typed anywhere else drops to the largest run at
  or below it, never up.
- **A price is looked up by combination key** — the chosen option ids ascending,
  hyphen-joined — through `/pricedbykey/{id}/{key}`. That is documented down to
  the example, so there is no guesswork left in what a line costs.
- **There is no order-status endpoint.** What we know about a job is what they
  said when they took it; the tracking number arrives in their dispatch email
  and is typed into the queue, which is what puts it on the candidate's own
  order page.

The rest:

- **Nothing outside `src/lib/shop/sinalite.ts` knows SinaLite exists**, except
  `vendor-map.ts`, which says which of our products are theirs.
- Both bought-in products are the **14pt UV high gloss** line — one stock for
  cards and one for hangers — which is why neither offers a coating choice in
  our catalogue: a finish the shop does not buy would take an order it cannot
  place. It is also why there is no write-on panel on the hangers; a UV gloss
  sheet cannot be written on.
- The mapping table **has no ids in it yet** — they cannot be guessed. With
  credentials set, `npm run sinalite:catalog -- --suggest` matches every
  unmapped entry against their live product list and prints the candidates with
  the product URL beside them; `-- --product <id>` then prints its option
  groups, including a ready-made `quantityOptions` line to paste. Until an entry
  is mapped, the queue shows the line as unmapped and refuses to send it, which
  is the safe failure.
- **Without credentials the whole pipeline is a dry run**, like the Twilio and
  Facebook ones: quotes come back marked, sending records what would have gone,
  and the order page says so.
- Pricing a job fills in what it costs us and what it would have to sell for —
  **their cost doubled, plus our file-prep charge** — and flags any line sold
  below that floor. Freight is quoted once for the whole job, and the shop can
  take a dearer, faster service than the cheapest.
- The candidate never appears on the trade order except as an address:
  **billing is always the shop**, because they are buying from Holm Graphics and
  must never see a trade price.
- Artwork goes over as a **signed, expiring link** to one file, sent as their
  `front` and `back`. The print files live in Postgres behind a session check,
  which a printer's fetcher cannot satisfy.

#### Adding another SinaLite product

Two files, in this order, and a check that they agree.

1. **Find their product.** `npm run sinalite:catalog -- --find "brochure"`
   searches names and skus. Note the id.
2. **Read its options.** `npm run sinalite:catalog -- --product <id>` prints
   every option group with its ids, and a ready-made `quantityOptions` line.
   Every group needs a value in the map — Turnaround and Stock included, since
   there is no default at their end.
3. **Add it to the catalogue** in `src/lib/shop/catalog.ts`: a product with one
   variant per cut you intend to sell, `quantitiesFixed: true`, and quantity
   breaks that match their `qty` runs exactly. Leave `pricingProvisional: true`
   until the real prices are in.
4. **Add it to the map** in `src/lib/shop/vendor-map.ts`: the product id, the
   fixed option ids, the quantity ids, and — if you are offering a choice — the
   translation from your option values to theirs.
5. **`npm run sinalite:check`.** No credentials or network needed. It catches
   the mistakes that would otherwise surface only when a candidate ordered: a
   cut in one file and not the other, a run the catalogue sells that the map
   cannot name, an option the catalogue offers that has no counterpart.

Prices for a bought-in line should be their cost doubled plus the variant's
setup fee — the same floor the queue measures against. `npm run
sinalite:catalog -- --variants <id>` prints every combination's trade price,
which is the fastest way to derive a whole table.

Prices live in one file, `src/lib/shop/catalog.ts`, and ship in a commit rather
than being edited in a database. Orders snapshot the names and the cents they
were quoted at, so changing a price never rewrites an order already placed.

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
| `npm run sinalite:catalog` | Print SinaLite's products, option ids and priced combinations, to fill in the vendor map |
| `npm run sinalite:check` | Check the catalogue and the vendor map still agree. No credentials needed |
| `npm run garments:import` | Load garment colours, sizes and costs from a CSV export. `--dry-run` shows what it read |

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
   | `SHOP_ETRANSFER_EMAIL` | where candidates send payment for print orders; defaults to `darren@holmgraphics.ca` |
   | `SHOP_NAME` / `SHOP_PHONE` / `SHOP_PICKUP_ADDRESS` | shown on the portal; all optional |
   | `SINALITE_CLIENT_ID` / `SINALITE_CLIENT_SECRET` | only when you are ready to send trade work; blank runs it as a dry run |
   | `SINALITE_ENV` / `SINALITE_STORE_CODE` / `SINALITE_MARKUP_PERCENT` | `sandbox` or `live`; 6 for Canada; 100 doubles trade cost |
   | `SHOP_SHIP_*` | where the trade printer ships a pickup order — the shop |

4. **Generate a domain** under Settings → Networking, and put it in `APP_URL`.
5. Deploy. `npm run start` runs `prisma migrate deploy` first, so the schema is
   created and kept current on every release — no manual migration step.

Point Twilio's webhooks at `https://your-app/api/sms/webhook` (inbound) and
`https://your-app/api/sms/status` (delivery). Both sit outside the sign-in gate
and verify Twilio's request signature instead.

### Turning on Facebook posting

Until this is done the Facebook section runs as a dry run: the plan, the drafts
and the schedule all work, and publishing records what would have gone out.

No App Review is needed for this. `pages_manage_posts` works straight away for
anyone holding a role on the Meta app who administers the Page they are
connecting — review is only what lets people with *no* role on your app connect
theirs.

1. **Make a Meta app**, or reuse one you already have, at
   [developers.facebook.com/apps](https://developers.facebook.com/apps). Add the
   **Facebook Login** product to it.
2. **Add each candidate under App roles → Testers.** They have to accept the
   invitation before they can connect a Page, and they must be an admin of the
   Page itself.
3. **Set the variables** on the Railway app service:

   | Variable | Value |
   | --- | --- |
   | `FACEBOOK_APP_ID` | from the Meta app's Settings → Basic |
   | `FACEBOOK_APP_SECRET` | the same page, behind *Show* |
   | `APP_URL` | must already be set and correct — the redirect URI is built from it |

4. **Add the redirect URI.** In the Meta app, under *Facebook Login → Settings*,
   put `https://your-app/api/facebook/callback` in **Valid OAuth Redirect URIs**.
   It has to match what the app sends to the character, and forgetting it is the
   usual reason the connect flow dies on the way back.
5. **Connect.** Each candidate opens the Facebook section and presses *Connect a
   Facebook Page*. If they administer more than one Page they get to pick.

Posting goes out over the candidate's own name, so the section is manager-and-up
— the same bar as texting and the money.

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
    facebook.ts        Graph API: the Page connection and putting a post out
    post-plan.ts       Cadence to dated slots, and the starter drafts that fill them
    geocode.ts         Google geocoding with precision tracking
    map-data.ts        Every point the map draws
    outbox.ts          The canvasser's offline queue
    address.ts         Address and street-name normalisation for cross-source matching
    finance.ts         Aggregations shared by the finance pages and Form 4
    enums.ts           Value sets for every String-backed column, plus labels
    campaign.ts        The singleton campaign row and its computed limits
    shop/
      catalog.ts       The print price list — products, cuts, sheet prices, options
      sinalite.ts      The trade printer's API, and the only place it is known
      vendor-map.ts    Which of our products SinaLite prints, and their ids
      fulfilment.ts    Trade cost, the price floor, and sending a job to press
      pricing.ts       Catalogue to money: quantity breaks, sheet discount, totals
      orders.ts        The cart, order numbers and re-adding an order up
      auth.ts          Print customers, and whose order is whose
      session.ts       The portal's own cookie, namespaced away from the app's
    form.ts            FormData readers used by every server action
    money.ts           Cents parsing and formatting
    csv.ts             CSV writing for the exports
    auth.ts            Who is signed in, and what they may reach
    guard.ts           Re-checks the caller against a record handed in by id
  app/
    actions/           Server actions, one module per domain
    (app)/             The campaign manager, behind the sign-in gate
      voters/  canvass/  volunteers/  shifts/  finance/  signs/  events/  social/
      shop/            The print queue — administrators only
    (portal)/          The election print portal, open to the public
      election/        Catalogue, cart, checkout, orders, account
  components/          Shared UI primitives and forms
```

Two conventions worth knowing:

- **Money is always integer cents.** `parseCents` reads user input; `formatCents`
  writes it back out. No float ever touches an amount.
- **`src/lib/ontario.ts` is the only place the Act is encoded.** The entry form
  and the standing audit call the same `checkContribution`, which is why what
  the form warns about at entry is exactly what the finance page flags
  afterwards.
- **A record id is not a permission.** Any action handed one resolves that
  record's campaign and re-checks the caller against it, in `src/lib/guard.ts`.
- **Consent rules live in `src/lib/sms.ts`, not in the UI.** The audience
  builder, the send loop and the opt-out list all enforce them, so a mistake in
  a screen cannot result in an unlawful message.

## Stack

Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4,
Prisma 6 with SQLite, Leaflet for mapping, Twilio for text messaging.
