# TravelRelay — Product Design and Implementation Specification

**Project:** PayPal AI Hackathon 2026  
**Target submission:** November 12, 2026, 12:00 PM Pacific / 3:00 PM Toronto  
**Status:** Approved product direction, implementation handoff — sponsor setup updated November 4, 2026  
**Priority:** A genuinely functional, polished, demonstrable application over a broad but incomplete feature list.

> This is the implementation source of truth for the approved TravelRelay MVP. Engineering choices below are recommended defaults, not previously user-approved architectural mandates. Before introducing a major dependency or changing the user-approved product experience, record and justify the choice.

## 1. Product thesis

TravelRelay is an AI-powered vacation planning and management platform. A traveler enters destination or desired travel vibe, departure city, dates, travelers, budget and preferences. TravelRelay generates a complete personalized, geographically plausible, budget-aware itinerary, which the traveler can edit through a context-aware AI agent. A connected TripWallet tracks estimated and actual spending; supported experiences can be purchased with PayPal Sandbox. If a supported paid activity is canceled, Trip Recovery offers a refund, reschedule, same-price replacement, different activity or free alternative, and adjusts the itinerary and financial states following explicit user approvals.

**Signature demonstration:** Generate Tokyo trip → inspect plan → purchase demo-merchant activity using PayPal Sandbox → simulate a clearly labeled provider cancellation → AI proposes alternatives for that slot → user reviews and approves refund/replacement as separate actions → verified refund + replacement transaction update Bookings, TripWallet and itinerary.

Never claim that TravelRelay books arbitrary flights, hotels, or unrelated third-party experiences. Display these as estimates, external links, or unsupported actions unless a live supported provider integration exists. Simulated merchant inventory and cancellation events must be clearly labeled in the UI/demo.

## 2. Design principles and visual identity

- **Editorial travel × clean productivity dashboard:** large destination photography, warm white surfaces, spacious type, polished cards and restrained animations.
- **Full-sized desktop application:** main pages are immersive workspaces, not chatbot popups. Global top navigation, no main sidebar. Optional docked AI panel (approx. 400–440px) occupies space beside main content; expanded full-width review workspace for complex changes. Mobile uses responsive stacking and bottom-sheet AI assistant.
- **No map-first interface:** map is secondary inside Itinerary/Explore only.
- **Visual tokens (suggested):** background `#FAFAF7`, surfaces `#FFFFFF`, deep text `#192723`, primary muted teal `#197C72`, warm accent `#E7B86E`, subtle borders, card radii ~16–24px. Typography: Plus Jakarta Sans or Geist headings, Inter body; optional restrained editorial serif on landing hero only. Confirm typography against implementation feasibility.
- Responsive 360px mobile through 1920px desktop; accessible contrast, keyboard controls, minimum tap targets, reduced-motion support. Use actual licensed/attributed imagery where allowed; reliable fallbacks. Never invent or scrape creator social videos.
- No fake progress percentages, unverified booking confirmation, deceptive prices, or unsourced live availability.

## 3. App navigation and routes

### Public
- `/`: permanent editorial landing page. Split hero: headline “The world is yours to explore. We’ll handle the planning.” Travel photo with tasteful itinerary preview, CTA `Start Planning`, secondary `See How It Works`; sections for process, product showcase, agent + PayPal experience, curated inspirations, footer. The hero is NOT a forced loading transition.
- `/explore`: curated AI-made trip templates. At least ~6 attractive, intentionally seeded templates, each with destination photo, summary, style, estimated cost labeled as non-live, day preview. CTA `Customize This Trip` opens wizard with template defaults.
- `/how-it-works` or landing anchors; auth pages as needed.

### Authenticated
- `/dashboard`: welcoming travel command center, upcoming trip hero, visual trip cards, create-new and explore-curated paths, high-level budget/status.
- `/trips/new`: four-step guided wizard, persistent draft and back navigation.
- `/trips/generating/:jobId`: actual job state progression; no premature itinerary previews; completed vacation revealed all at once.
- `/trips/:id`: Overview, plus nested horizontal tabs `Itinerary`, `TripWallet`, `Bookings`, `Explore`. Route tabs using stable deep links as appropriate.
- Global top nav on desktop: Dashboard, My Trips, Explore, Create Trip, Profile. Responsive mobile menu. Preserve context and avoid excessive route animations.

## 4. Four-step trip creation wizard (approved)

**Step 1 — Destination**
- Two explicit choices: “I know where” (city/country/region input) and “Help me decide” (vibes and interests, later matched to date/budget).
- **Single base city by default.** If user selects a country, propose one base city for confirmation; NEVER silently generate a multi-city route. Multi-city is opt-in only.

**Step 2 — Trip Details**
- Departure city, start/end dates, flexible dates/approximate month and length, traveler count (single simple +/- count, no adult/child breakdown in MVP), pace: relaxed/balanced/packed.

**Step 3 — Budget**
- Numeric amount and primary currency; budget scope: entire vacation (travel/accommodation/etc.) or spending-only (flights/accommodation covered); spending style budget-friendly/balanced/premium. Auto suggested category allocations and protected safety reserve. Manual category override optional later.

**Step 4 — Preferences**
- Optional multi-select interests: food, culture, outdoors, adventure, shopping, nightlife, art, relaxation, hidden gems, entertainment. Free-text must-see and optional avoids; dietary/accessibility optional advanced fields. Do not ask pace twice. All preferences optional. Review trip summary before submission.

**Generation**
- Persists user inputs before starting. Server-backed progress stages: review constraints, discover candidates, arrange days, budget/schedule validation, complete. Status reflects real backend stages, no fake percent. Handle retries, job reopening, errors, partial availability warnings. Reveal complete itinerary together after validation, then prominent `Explore My Trip` and `Make Changes with AI`.

## 5. Trip Overview (approved)

- Cinematic destination hero, trip metadata, planning state, horizontal trip tabs.
- Three compact summary metrics: total budget, projected costs, unallocated budget (with explicit units/currency).
- Visual daily cards: show first 3 by default, `View all` for remaining days; photo, day/date, thematic title, 2–3 highlights, relevant planning/booking alerts. Clicking day goes to full Itinerary tab/day.
- Below: compact TripWallet preview and Bookings preview; brief contextual AI suggestion section. Persistent Ask TravelRelay control.
- Mobile: swipeable day cards; horizontally scrollable trip tabs; vertically stacked summaries. Desktop: generous content max width ~1200–1400px and 3-column cards.

## 6. Itinerary tab (approved)

- Detailed chronological day timeline, easily selectable days, day-level photo/summary, planned start/end and local timezone; activity cards including images, type, duration, native-currency estimate, booking/payment state, optional verified social inspiration link, location, and detail drawer.
- User can propose moving, replacing, removing or optimizing activities through controls or agent; protect confirmed bookings from casual edits. Travel buffers, durations, opening hours and price feasibility must be validated; warn if information is estimates or unverified.
- Secondary day map accessible via action/tab, never the primary screen. Map integration may be deferred if needed; use verified coordinates.
- Creator-attributed TikTok/Instagram URLs only when actually verified, link to originals; optional supported embeds. Social URL ingestion is future scope, not essential.

## 7. Trip Recovery (approved; essential demo)

Canceled activity remains on day timeline with `Canceled` / `Action needed` status and `Resolve with TravelRelay` action. Recovery options:
1. Reschedule same activity if provider offers confirmed available slot.
2. Replace with comparable experience around same price.
3. Choose any suitable alternative that fits time and spending budget.
4. Choose suitable free activity.
5. Refund only and keep schedule open.

AI candidate ranking must consider duration, slot timing, transit distance, merchant/provider availability, local opening hours, user interests, budget, existing confirmed bookings, and refund rules. Show native and approximate home currency with attribution to FX rate and timestamp. Present before/after schedule and financial impact. User must approve relevant changes. Refund and replacement checkout are **separate** transactions/approvals; do not assert success until verified. If one succeeds and the other fails, show truthful partial state and recovery options.

For the MVP, implement controlled demo merchant activities and an explicit `Simulate cancellation` demo path. No promise of real supplier event feeds; architecture allows later provider adapters.

## 8. TripWallet & Bookings (approved)

### TripWallet
- Budget is a **planning ledger**, NOT an actual PayPal balance or stored-value wallet.
- Track total trip budget; confirmed net spending; unpaid estimated spending; projected trip cost; unallocated amount; protected reserve; genuinely available-for-new-plans amount; pending refund not counted as available.
- Maintain an append-only underlying payment/refund ledger with provider IDs, statuses, currency, original amount, capture/refund references, timestamps; derive summaries, no editing transaction history.
- Present compact cards and progress allocation; detailed activity ledger with status. Separate estimates from payments and completed refunds.

### Multicurrency (required MVP)
- Select home/base currency in wizard; infer local destination currency with override. Display both local vendor prices and approximate home-currency equivalent, clearly labeled.
- Fetch FX rates via a reputable public service such as Frankfurter, cache briefly, record rate date/source; daily rates are estimates, **not guaranteed live PayPal quotes**.
- Preserve original vendor currency, PayPal transaction currency, actual amounts, fees (when supplied), and refund amounts. Display currency preferences do not change historical records.
- Support currencies supported by provider and currency-specific minor units (e.g., JPY zero decimals) appropriately. Do not assume all currencies are supported for PayPal processing.
- PayPal conversion rates/refund outcomes can differ from planning estimates. Never present forecast FX as actual charge or refund.

### Bookings
- Reservation list, details, exact status, provider, reservation code/reference, scheduled time and locale, payment link, confirmation/receipt where available. Supported actions: inspect, reschedule, cancel/refund request, find alternative. Clearly distinguish demo merchant inventory from external recommendations.
- Explicit possible states: planned/unbooked, checkout pending, authorized, captured/confirmed, cancellation requested, canceled, refund pending, partially refunded, refunded, failed. Exact state machine to be implemented based on provider events.

### PayPal
- Use PayPal **Sandbox** only for hackathon demo. Server holds secret, frontend sees only safe client ID. Use Orders v2 purchase/authorize/capture appropriately, Payments v2 captures/refunds, webhooks/status reconciliation when configured. Never rely solely on browser “payment successful” callback; verify server-side. Idempotency keys and duplicate-refund safeguards. No automatic buyer charges; separate PayPal approval/checkout every purchase.
- Demo merchant controls inventory and can initiate refund for owned captured transactions; no arbitrary flight/hotel third-party refunds.

## 9. Context-aware AI agent (approved)

- Persistent but optional assistant inside each trip; desktop docked right, mobile bottom sheet, expanded full-width action comparison for complex tasks. NOT a popup-centric app.
- Free-form requests: change schedule, optimize budget, discover experiences, recover cancellations, help book eligible demo experiences. Understand trip/day/activity/booking context, dates/timezone, budget, preferences and current state.
- Agent should return structured proposed actions with readable explanations: `add_activity`, `remove_unbooked_activity`, `move_activity`, `replace_activity`, `suggest_reschedule`, `suggest_refund`, `suggest_checkout` as scoped operations.
- **No direct arbitrary LLM database mutations**. Backend validates schema, permissions/ownership, plan version, conflicts, availability/merchant support, and finances before mutations.
- Non-financial itinerary changes require before/after preview and user approval. Refunds, reschedules of confirmed bookings, and purchases require separate explicit approval and provider/PayPal execution. The AI never claims execution until verification succeeds.
- In-app change history; undo non-financial edits. Undo cannot reverse financial transactions.
- Suggested prompts are context-sensitive; proactive suggestions dismissible, not automatically applied.

## 10. Technical architecture (recommended defaults)

Time-to-ship preference: **single full-stack Next.js TypeScript app** using App Router, React, Tailwind CSS and accessible components (shadcn/ui or equivalent). PostgreSQL on Neon with Prisma or equivalent migrations/ORM. Deploy frontend/server to Vercel if suited to long-running generation, or put async worker on Render if necessary. Authentication via established secure library (Auth.js or equivalent); users must be scoped to their own trip data. Prefer one well-tested deployed backend over a microservice maze.

**Services/modules:** `auth`, `trips`, `wizard`, `generation-jobs`, `itinerary`, `activities`, `curated-templates`, `fx`, `budget-ledger`, `demo-merchant`, `bookings`, `paypal`, `agent-proposals`, `recovery`, `notifications` (optional). Use model provider behind thin adapter and validate model-produced JSON via schema. Never place API keys or PayPal secret in client bundles.

**Suggested persistent data objects:** `User`, `Trip`, `TripPreference`, `TripDay`, `Activity`, `ActivityTimeSlot`, `GenerationJob`, `CuratedTemplate`, `MerchantProduct`, `Booking`, `PaymentRecord`, `RefundRecord`, `BudgetLineItem`, `FXSnapshot`, `AgentConversation`, `AgentProposal`, `ProposalAction`, `ActionAuditEvent`.

**Suggested API / server actions:** trip CRUD, wizard draft save, generation launch/status/result, itinerary view and proposal preview/apply, activity discovery, FX quote, budget summary, merchant inventory/availability, booking creation/status, PayPal order creation/capture, refund request/status, webhooks, agent chat/proposal generation, cancellation simulation (demo-only feature flag).

**Reliability:** authorization checks on every resource; no trust in LLM output; transactions and optimistic version checks for mutations; webhook signature verification; PayPal idempotency; server-side recomputation of monetary totals; event/audit log; resilient network failures, loading/empty/error states; rate limit agent endpoints.

## 11. Sponsors — practical implementation plan

**Optional, not eligibility requirements.** The official hackathon FAQ allows any AI tool and multiple sponsor tools, but winning a sponsor award depends on genuine relevant use, not just installing a dependency. Prioritize PayPal + AI, working Sandbox payments, and Trip Recovery over extra integrations.

### APIMatic — set up before implementing PayPal (development-time tool)

- Install the official PayPal Context Plugin's **TypeScript skills** in Codex when setting up development, or at minimum before Milestone 3. The official Context Plugins marketplace documents the Codex-compatible `skills` CLI flow:

  ```bash
  npx skills add https://github.com/context-plugins/plugin-marketplace/tree/main/plugins/paypal/skills/typescript
  ```

- Select Codex if the installer offers an agent choice. Restart Codex or reload skills, then ask Codex to list the installed PayPal integration skills and confirm it can read them.
- Alternative marketplace command `npx context-plugins install paypal` is published by APIMatic. However, the installer's own README specifically documents auto-detection of Claude Code, Cursor and VS Code, so **verify Codex detection** rather than assuming this command alone configures standalone Codex. The `npx skills add .../typescript` route is the clearer choice for Codex.
- Use the skills to implement Orders v2, capture/refund, webhooks, and tests. In the README/demo explain which integration steps used APIMatic and why; do not claim an award merely for installation. No additional APIMatic account is required for the PayPal context plugin per sponsor page.
- Source: https://paypalaihackathon.devpost.com/details/apimatic , https://github.com/context-plugins/plugin-marketplace

### Bryntum — decide before the detailed Itinerary UI, integrate during Milestone 2

- Official hackathon sponsor offers a **45-day trial**, with example:

  ```bash
  npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial
  ```

- Sponsor access: https://paypalaihackathon.devpost.com/details/bryntum ; https://bryntum.com/download ; React integration: https://www.bryntum.com/products/scheduler/docs/guide/Scheduler/integration/react/guide
- Best fit: schedule/time-slot editing and AI rescheduling or Trip Recovery. Integrate Bryntum into the detailed Itinerary's optional **Schedule view**, while keeping the approved image-rich day timeline as the primary experience. Use an adapter so itinerary activities and booking data don't depend on the UI library.
- Confirm exact compatible React wrapper/trial package and usage license before installation. Do not commit commercial package files or private registry tokens; install via dependency manager. Confirm that the live demo will remain usable during judging. Don't wait until the finished site to redo the schedule UI.

### Other sponsors — only if they solve a real need

- **AG Grid**: possible later if building agent-driven TripWallet analytics; simple spending cards are insufficient motivation for the prize category.
- **Render**: optional if persistent generation jobs/worker or webhooks need hosting beyond the frontend runtime.
- **Postman**: useful for testing/documenting PayPal integration throughout development, but only prioritize the sponsor prize if the submitted project uses it meaningfully.

**Plan:** APIMatic skills now; Bryntum assessment at itinerary milestone; everything else optional. Sponsor-specific rules and trials can change—verify them before final submission.

## 12. Phased execution plan (time-boxed; ship vertical slices)

### Milestone 0 — Secure local setup
- Clone existing user-owned GitHub repository, inspect contents before modifying; initialize app only if not already present.
- `.gitignore` for `.env*` and key files, with an explicit `!.env.example` exception; commit `.env.example` with placeholder variable names only (no secrets), README, license (user-selected), project lint/typecheck/tests.
- User adds secrets locally/deployment dashboard, never in chat or commits. Verify Sandbox mode.

### Milestone 1 — Beautiful navigation + real trip persistence
- Global nav, landing, auth, dashboard, Explore seeded curated trip templates, four-step wizard, draft save, trip DB schema. Build responsive layout and reusable UI components. Placeholder but **honestly labeled** generation if AI not yet implemented.
- Exit: user can sign in, create/save trip intent and navigate to trip overview reliably; pages polished at desktop and mobile sizes.

### Milestone 2 — Working AI itinerary
- AI structured trip generation; job states, realistic single-city days, basic cost estimates, full-trip reveal, persistence; Overview visual day cards; detailed timeline; trip-specific AI proposed itinerary edits with validation and approval.
- Exit: complete generated trip can be revisited, edited, and saved; budgets recomputed after edits.

### Milestone 3 — TripWallet + currency + Sandbox checkout
- FX service with source/rate date; ledger and budget summary; seeded demo merchant paid experiences; PayPal Sandbox order/capture (server verified); bookings UI; test buyer payment.
- Exit: buyer successfully purchases a supported activity and booking + paid balance appear consistently.

### Milestone 4 — Trip Recovery + refund + replacement
- Controlled cancellation event; AI candidate replacement proposals constrained by schedule/budget; explicit review/approval; merchant refund of captured payment, status verification, replacement purchase in separately approved checkout; all three screens reconcile. Handle partial failure.
- Exit: repeatable demo end-to-end without pretending to have real airline/hotel booking access.

### Milestone 5 — Polish, test, document, submit
- Cross-device UI polish, keyboard/mobile QA, error and empty states, build/typecheck/tests, backend integration checks, seeded judge demo, clear sample credentials/instructions, deployment, public GitHub with open-source license, README, architecture notes, privacy/limitations, public YouTube video under 3 minutes, Devpost submission before deadline.

### De-scope first if schedule slips
- Social import from TikTok/Reels, user-upload media, complete supplier flight/hotel booking, maps with turn-by-turn ETA, full drag-and-drop scheduling, AG Grid analytics, complex multi-city itineraries, multi-party expense splitting, voice agent, custom payment processor. **Do not de-scope real Sandbox purchase/refund or meaningful agent itinerary changes unless absolutely necessary; these are our differentiation.**

## 13. Must-pass acceptance tests

1. New user creates a single-city trip; wizard budget is stored in chosen currency and scope.
2. AI generation returns persisted multi-day itinerary and final reveal without exposing partial generated days.
3. User asks AI to rearrange a day; preview shows before/after, and approved change persists; unapproved edit does not.
4. Booked activity is protected from unapproved rescheduling/removal.
5. PayPal Sandbox checkout uses test buyer and merchant; server verifies capture; duplicate callback doesn't double-count payment.
6. Demo merchant cancellation visibly changes booking state and triggers Recovery; alternatives fit slot and user can choose similar, different, free, refund-only, or eligible reschedule.
7. Refund pending is NOT shown as spendable funds. Once verified, ledger and summary reconcile; replacement purchase remains separate.
8. Home/local currency conversions show rate source/date, original amounts stay intact, and JPY minor units are handled correctly.
9. Failed refund, failed capture, stale proposal and service outage show recoverable error without fabricated confirmation.
10. Desktop displays a full-width page with optional docked assistant; mobile remains functional at 360px; keyboard navigation works.
11. `npm run lint`, typecheck, test and production build pass using documented setup. No secrets in Git history.

## 14. Team / Codex development contract

- Read this specification first. At each milestone: inspect repo; state intended files and tasks; work only on that milestone; commit cohesive changes; run tests; summarize what is real versus mock and what still needs credentials/provider setup.
- Preserve approved visual direction and desktop-first full application. No giant chatbot landing UI, no map-first workspace, no forced full-screen loading beyond real generation.
- Use strict external action controls and transaction-safe bookkeeping. Never simulate PayPal success as if real. Clearly label controlled demo provider events.
- If a sponsor tool introduces license or schedule risk, ask or skip. Deliver functional vertical slices rather than speculative architecture.
