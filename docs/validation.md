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
