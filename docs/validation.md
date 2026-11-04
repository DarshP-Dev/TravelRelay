# Milestone 1B validation

Validated November 4, 2026, on Windows with Node 24.22.1 and npm 11.19.1.
The foundation report below is historical; this section describes current behavior.

## Final checks

| Check                                   | Result                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Dependency installation and local setup | Passed; generated ignored secret, applied committed PostgreSQL migrations |
| `npm run lint`                          | Passed with zero warnings                                                 |
| `npm run typecheck`                     | Passed                                                                    |
| `npm test`                              | 9 integration tests passed; real auth and persistent database, no mocks   |
| `npm run build`                         | Passed; public pages static, protected/account/API pages dynamic          |
| `npm run format:check`                  | Passed                                                                    |
| Production HTTP smoke checks            | 13 passed: 5 public pages, 5 protected pages, 3 private API requests      |

Production HTTP checks verify public pages return 200; unauthenticated private
API requests return 401. Protected server pages redirect to login without
private data. Next.js streamed page redirects can carry HTTP 200 plus the
redirect instruction; HTTP status alone is not the page authorization test.

Successful native builds and localhost HTTP checks required elevated tool
permissions because the Windows sandbox blocks native compilation/networking.
The local production preview used the explicit ALLOW_LOCAL_DATABASE QA flag;
this is not a deployment or hosted PostgreSQL verification.

## Integration coverage

`tests/application.test.ts` exercises the actual Better Auth handler, application
resource handler, committed SQL migrations and a temporary disk-backed PGlite
instance. It uses generated in-memory secrets/passwords and reserved test email
addresses. Test directories are isolated from `.data/travelrelay` and removed
after closing the database.

- Signup creates a user, scrypt hash and server session; passwords are not stored
  as plaintext. Cookies carry HttpOnly and SameSite=Lax attributes locally.
- Anonymous, forged and database-expired sessions are denied.
- Incorrect credentials fail; logout revokes a session so its old cookie fails.
- Cross-origin auth and resource writes are rejected.
- Draft creation/resumption, autosave data and exact version persistence work.
- Alice cannot read or update Bob's resources, and their lists stay separate.
- Two concurrent writes with one expected version produce one success and one 409.
- Invalid dates, unsupported currencies, owner injection, invalid traveler counts,
  incomplete trip saves and oversized bodies are rejected.
- Saving a complete intent is atomic and idempotent under duplicate requests;
  a delayed write cannot mutate its archived draft. Trips remain owner-scoped.
- Users, sessions, drafts and trip intents survive database close/reopen.
- Auth rate limits return 429; return paths reject off-site destinations.

## Browser verification

- Public planning CTA redirects to login, preserves its return path, and signup
  returns to the intended wizard. Signed-out and signed-in navigation differ.
- Entered Kyoto/Toronto, fixed dates, two travelers, JPY 270000 spending budget
  and a food preference using the actual four-step form. Live summary updates.
- Draft destination and step state restore after refresh. Logout and login restore
  the review step and exact budget/date/preferences from the database.
- Save trip intent creates an actual private record, opens its overview, and adds
  the real trip card/count to the dashboard. No itinerary is fabricated.
- Reopened the same development database in the production server after stopping
  dev: the browser session, Kyoto draft and saved trip still existed. Production
  logout succeeded and restored public navigation.
- Opened two wizard tabs. A newer save caused the stale tab to show a conflict,
  disable writes and offer explicit reload/discard. That action restored the
  newer server version. Fixed an extra unload guard on that explicit discard.
- Supported Tokyo/Kyoto/Paris input changes the photo; unsupported input uses a
  labeled default inspiration image, without pretending to infer a destination.
- Wizard layout checked at 360, 390, 768, 1440 and 1920 CSS pixels with no
  horizontal overflow. At 390px the form stacks, photo is compact and its summary
  can be collapsed/expanded with native accessible controls. Overrides reset.
- Kept the original palette, typefaces, photos, sections and four-step controls;
  increased small text/secondary contrast, widened applicable containers and
  selectively tightened landing section spacing.

Screenshots: `screenshots/milestone-1b-wizard-desktop.jpg` and
`screenshots/milestone-1b-wizard-mobile.jpg`. They show real saved drafts for a
local test account, not AI output or a booking. Test account credentials were
randomly generated, never committed, and the browser was signed out afterward.

## Configuration and remaining limits

- `.env.example` has blank configuration names. `.env.local`, local data and test
  data directories are ignored; no credentials or database records are staged.
- PGlite is local, single-process persistent PostgreSQL-compatible storage.
  Hosted pg/Neon connection code exists but no external database was provisioned
  or exercised. Configure hosted PostgreSQL, migrations and HTTPS before hosting.
- Email ownership verification, password recovery, OAuth and MFA are not connected.
  Profile and auth pages communicate this limitation. No verification flag is faked.
- No itinerary generation/jobs, FX, ledger, supplier availability, PayPal purchase,
  refund, Trip Recovery, Bryntum, or AG Grid implementation was added.
- Full dependency audit reports 20 moderate findings in lint/migration tooling
  chains. `npm audit --omit=dev` includes 4 from Drizzle Kit's legacy esbuild
  dependency chain because npm also classifies it through Better Auth's optional
  CLI peer. No forced incompatible downgrade/override was used. Track compatible
  tooling updates; this run does not claim a clean audit.
- No hosted deployment, Git push, or Milestone 2 work. The supplied untracked
  design/kickoff/sponsor notes, APIMatic skills and skills lockfile are untouched.

## Historical foundation report

# Milestone 1 foundation validation

Validated November 4, 2026, on Windows with Node 24.22.1 and npm 11.19.1.

## Command results

| Check                       | Result                                            |
| --------------------------- | ------------------------------------------------- |
| `npm install`               | Passed; dependency lockfile created               |
| `npm run lint`              | Passed, zero warnings (`--max-warnings=0`)        |
| `npm run typecheck`         | Passed (`next typegen` and strict `tsc --noEmit`) |
| `npm run build`             | Passed; Next.js production output generated       |
| `npm run format:check`      | Passed                                            |
| `git diff --check`          | Passed                                            |
| `npm audit --omit=dev`      | Passed, zero production vulnerabilities           |
| Production HTTP smoke check | Passed all 16 expected route statuses             |

The Windows sandbox blocked the native build and local HTTP networking, so the
successful production build and HTTP checks ran with approved elevated tool
permissions. There is no automated unit-test suite; these are compiler, lint,
production route and manual browser checks, not a claim of integration coverage.

## Production route checks

HTTP 200: `/`, `/dashboard`, `/trips`, `/explore`, `/trips/new`,
`/trips/new?template=tokyo`, `/profile`, `/credits`, `/trips/preview`,
`/trips/preview/itinerary`, `/trips/preview/wallet`, `/trips/preview/bookings`,
`/trips/preview/explore`.

HTTP 404: `/trips/not-a-real-trip`, `/trips/preview/unknown`,
`/trips/preview/itinerary/extra`.

Unknown workspace URLs initially produced streamed HTTP 200 not-found pages.
The final shell explicitly prerenders only the five preview paths with
`generateStaticParams` and `dynamicParams = false`; production 404s now pass.
This restriction must be replaced with ownership-checked real trip retrieval
when persistence is implemented.

## Browser checks

- Inspected the editorial landing page, desktop three-column Explore grid, and
  optional docked assistant. Real photos load from local assets; no map-first
  layout or popup-based main experience.
- Production landing layout checked at 360, 390, 768, 1440 and 1920 CSS pixels;
  no page-level horizontal overflow. 390px mobile layout and 1440px desktop
  screenshots captured. Responsive overrides were reset afterward.
- Mobile navigation opens all five primary destinations, closes on selection,
  and dismisses with Escape. Explicit keyboard focus styles and skip link exist;
  this is not a full assistive-technology audit.
- Explore contains all six editorial cards, real destination photographs,
  non-live estimate labels, day-theme disclosures and customization links.
- Tokyo template opens the form with an editable single base city, 7-day length,
  USD spending-only budget, one traveler and selected interests.
- Required input prevents advancement; fixed dates submit and survive back
  navigation. Flexible month `2027-04` appears in review with the chosen length.
  Native date values are read at submit as well as during edits. End-before-start
  validation exists; no dates or destination availability are verified.
- Traveler controls and optional interest selection work. Back navigation retains
  in-form values. A JPY 200000 sample renders without decimal places, and currency
  selection clearly states it does not perform FX conversion.
- Review explicitly says nothing is saved/generated; save/generate stays disabled.
  Refresh resets the form to its initial/template state, as documented.
- TripWallet navigation uses a stable URL, communicates the planning-ledger
  boundary, and contains no financial records. Opening the assistant docks it
  beside desktop content and stacks it on mobile; message input is disabled.

## Screenshots

- `screenshots/landing-desktop.jpg`: final production landing at 1440px.
- `screenshots/landing-mobile.jpg`: final production landing at 390px.
- `screenshots/wizard-review-mobile.jpg`: sample review at 360px, not a saved trip.
- `screenshots/workspace-desktop.jpg`: empty wallet shell and optional assistant.

## Security, dependencies and repository state

- `.env.example` contains blank assignments and configuration names only.
  No credentials were requested or added.
- Verified `.env.local`, `.env.production`, `.pem` and `.key` files are ignored.
  A source/assets/docs helper scan found no matching private keys or model-key
  patterns. This is a targeted sanity check, not a comprehensive secret audit.
- Full `npm audit` reports 16 moderate **development-tooling** findings related
  to transitive `minimatch` glob amplification. No safe fix compatible with the
  current lint plugin peer requirements was applied. ESLint 9.39.5 is retained
  because bundled React/accessibility/import plugins do not yet accept ESLint 10;
  npm marks ESLint 9 deprecated. Track compatible tooling updates. Production
  audit is clean. No forced overrides or automatic major downgrades were used.
- APIMatic's nine TypeScript skills were verified present/readable, with future
  usage recorded in `architecture.md`. No integration is claimed.
- No PayPal/model SDK, Bryntum, or AG Grid installed. No payment, AI, booking,
  refund or availability result fabricated. No deployment or push performed.
- Existing MIT license and Git history preserved. The supplied untracked design,
  kickoff, sponsor notes, skills and skills lockfile were left untouched and are
  not bundled into the app implementation commit.
- GitHub API verified the active login as `DarshP-Dev` (account ID 254763357).
  The implementation commit uses its GitHub noreply author/committer identity.

## Exact next task

Complete the remaining **Milestone 1** persistence slice: secure authentication,
ownership-scoped PostgreSQL trip schema, durable wizard drafts, save/reopen trip
intent, and database-backed dashboard/overview empty states. AI generation stays
disabled. Do not begin Milestone 2 without user approval.
