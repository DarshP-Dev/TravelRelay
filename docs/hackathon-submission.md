# PayPal AI Hackathon submission

[Hosted demo](https://travelrelay.vercel.app) · [No-login example](https://travelrelay.vercel.app/example-trip) · [Public MIT repository](https://github.com/DarshP-Dev/TravelRelay) · [Devpost rules](https://paypalaihackathon.devpost.com/rules)

## Devpost description

**TravelRelay — an AI travel planner that helps when plans change.**

TravelRelay turns your dates, budget, and interests into an editable trip itinerary. Schedule activities in Bryntum, track estimates and spending in TripWallet, and ask an AI assistant for changes you can preview before approving. When a demo booking is canceled, TravelRelay compares replacements against your schedule and budget without touching your emergency reserve. We verified the payment loop locally with PayPal Sandbox: buyer-approved checkout, a verified refund, and a separately approved replacement purchase. Try the hosted planning workspace or open the labeled example without an account. The hosted demo does not enable Sandbox checkout.

## Built with

- **OpenAI Responses API, GPT-6.1 Sol:** Generates structured itineraries and proposes trip edits and recovery options. Google GenAI with Gemini 3.5 Flash-Lite is an explicitly selected alternative for itinerary generation.
- **PayPal JavaScript SDK v6, Orders v2, and Payments v2:** Handles Sandbox buyer approval, order capture, refund, and server-side reconciliation.
- **Bryntum Scheduler Community and Leaflet:** Provide the visual itinerary schedule and optional location map.
- **Next.js, React, TypeScript, and Better Auth:** Power the web workspace, API routes, and account sessions.
- **Drizzle, Neon PostgreSQL, PGlite, and Vercel Fluid Compute:** Persist account-scoped itineraries, jobs, and financial history in the hosted and local environments.
- **Frankfurter/ECB:** Provides indicative FX references for cross-currency planning.

## Demo checklist

Aim for a recording under three minutes. Use saved data and existing evidence; no new provider requests are needed to record the walkthrough.

1. **0:00–0:35 — Plan.** Open the hosted app. Show curated trips and the saved Paris itinerary, or start from the no-login example. Briefly explain how the AI uses dates, interests, and budget.
2. **0:35–1:10 — Review.** Show the Bryntum schedule and an activity's details. Explain that changes are previewed and the user decides whether to save. For an assistant proposal, use approved prior evidence and label its source; opening the drawer alone does not generate a proposal.
3. **1:10–2:30 — Recover.** Switch to the local QA workspace and label it **PayPal Sandbox**. Show the original USD 5.00 payment, simulated cancellation, replacement itinerary approval, completed full refund, and separately approved USD 5.00 replacement purchase. Show distinct booking records, USD 5.00 net Sandbox spending, and the untouched reserve. Use existing verified records or footage; keep private credentials and transaction references off-screen.
4. **2:30–2:50 — Hand off.** Show the hosted and public-repository links. Clarify that no real money or supplier inventory was involved. The hosted Activity Insights fallback opens a Google Maps search and does not fetch reviews.

For the Sandbox segment, use the [verified local acceptance report](milestone-5-final-acceptance.md) and [reproduction steps](paypal-sandbox.md). For project images, use the [dashboard](screenshots/hackathon-dashboard.png), [scheduler](screenshots/hackathon-itinerary.png), and [mobile activity details](screenshots/hackathon-activity-mobile.png); all three are offline UI examples.

## Before submitting

- Publish the demo video on YouTube with public visibility and check its link in a signed-out browser. Keep the video under three minutes.
- Enter the description, technology list, hosted demo URL, public repository URL, and video URL on Devpost. Use screenshots where useful.
- Once the documentation commit is published with approval, verify that the GitHub README links and MIT license are visible. Judges can explore the hosted example without credentials, sign up for their own account, or follow the local setup to test Sandbox with their own Sandbox accounts.
- Submit on Devpost before **November 12, 2026, at 3:00 p.m. Toronto time** (noon Pacific), per the [official schedule](https://paypalaihackathon.devpost.com/details/dates). Confirm that Devpost shows the entry as submitted.
