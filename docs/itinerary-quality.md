# Milestone 2A itinerary quality refinement

The subsequent [targeted reliability pass](itinerary-reliability.md) supersedes
the budget and meal rules described below. It adds audited buffer normalization,
inclusive category allocations and stronger meal/location checks, tested offline.
This document retains the earlier policy/evidence for context.

Implemented November 4, 2026 and initially validated offline. The subsequent
[single approved live check](milestone-2a-live-quality.md) failed the unchanged
quality gate on one declared buffer; it also exposed manual meal-quality concerns.
No recorded response or validator was rewritten to make it pass.

## What changed

`src/lib/itinerary-quality.ts` builds a day-specific planning brief and evaluates
complete plans after the unchanged schema, city/date, scheduling and budget checks.
`src/server/generation.ts` runs this gate before its existing atomic save. Failed
quality leaves the itinerary absent, original input intact, and the existing
explicit retry/error flow available. There is no automatic repair/model call.

The Gemini response DTO and compact provider grammar are unchanged. The prompt
now receives the complete day policy, concrete interest requirements, duration
and buffer guidance, lunch/rest rules and applicable server-owned venue references.
The same rules run in the server quality gate; they are not just prompt suggestions.

| Day type       | Meaningful activities                  | Planning window |
| -------------- | -------------------------------------- | --------------- |
| Full, relaxed  | 2–3; at most 6 planned activity hours  | 09:00–22:00     |
| Full, balanced | 3–5; at most 8 planned activity hours  | 09:00–22:00     |
| Full, packed   | 5–7; at most 10 planned activity hours | 09:00–22:00     |
| Arrival        | Relaxed 1–2; balanced/packed 2–3       | 14:00–21:00     |
| Departure      | 1–2; at most 2 planned activity hours  | 09:00–12:00     |
| Single day     | Relaxed 2–3; balanced 3–4; packed 4–5  | 10:00–17:00     |

Full days can run until 23:00 for a selected Nightlife interest. Arrival activity
minutes are further capped at 180/240/300 for relaxed/balanced/packed; single-day
caps are 240/300/360. These are conservative planning defaults, not asserted
flight/rail schedules. They are disclosed in the finished itinerary, and may not
fit actual travel arrangements. The wizard still does not collect booked transport
or exact arrival/departure times. The prompt must explain infeasible constraints
instead of inventing transport or silently dropping preferences.

Meaningful counts exclude generic rest, free time and logistics. Activities need
concrete descriptions of at least 60 characters. Museum/palace visits allow 90–240
minutes, walks/gardens 45–180, food experiences 45–120 (coffee/café 30–120), hikes
60–360, and other experiences 30–240. Full days need a substantive lunch experience
or a free 60-minute lunch/rest window between 11:30 and 14:30, separate from travel.
Duplicate indoor venue visits are rejected to discourage padding.

Transfer estimates use walking at 4.5km/h plus 10 minutes for distances up to 2km,
with a 15-minute floor. Longer transfers use 20km/h plus 20 minutes with a 30-minute
floor. An accessibility preference adds a 10-minute planning allowance without
claiming route accessibility. Arrival first stops need a 30-minute settling buffer.
These are conservative coordinate estimates, not routing, public-transit or
accessibility verification. Actual routes can take longer.

## Interests and preferences

Every selected interest needs at least one recognized concrete activity in the
activity title/location. Food needs a café, tasting, cooking, restaurant/food-market
or similar experience; `foodMinor` and claims in the introduction do not count.
The other nine interests have activity-cue coverage checks too; Nightlife requires
an evening activity starting at or after 18:00. Generic city/venue placeholders
do not count as concrete locations. This is an English
lexical heuristic, not semantic proof. It can miss valid activities or match loosely.
Free-text must-sees, dietary/accessibility needs, spending style and complex avoid
requests remain model-guided and require human review. Explicit nightclub avoidance
has an additional direct activity check. No allergy/accessibility verification is
implied by passing the gate.

## Venue information and display

`src/server/venue-references.ts` contains a deliberately small, server-owned
published-hours catalogue. Its current entry is Musée d’Orsay, checked November 4,
2026 against [the official visit page](https://www.musee-orsay.fr/en/visit): Monday,
May 1 and December 25 closure; 09:30 opening on other days; normal last admission
17:00 and gallery closing 17:30; Thursday last admission 21:00/gallery closing 21:15.
Visits are checked against local calendar weekdays, source windows and closures.
Matching also requires the Paris base, venue alias and nearby coordinates.

A published reference is not a live/future opening guarantee, verified ticket
availability, verified price, booking or independent verification of every venue
attribute. Unknown indoor visitor venues use an explicitly unverified, conservative
10:00–17:00 planning window. This can reject valid evening openings until a source
reference or richer timing input is added. No venue API or automatic source
scraping was added.

Accepted trips receive optional server-generated `quality` metadata in their
existing JSONB itinerary: day roles, planning assumptions, interest matches and
scoped source checks with URLs/check dates/published windows. No SQL migration was
needed. Model-supplied verification or quality properties fail the unchanged strict
response schema. The AI cannot award itself a verification badge.

The existing itinerary UI now shows start **and derived end** times, durations,
travel buffers, travel-day roles and visible timing assumptions. Source-backed
activities show a dated official-hours reference and exact published visit window;
all other venue hours are labeled unverified. Prices remain estimates in both cases.
Older saved trips are not modified or represented as passing newer checks: a
legacy notice identifies them. Future editing must recompute this metadata rather
than reuse stale index-based source matches.

## Offline evidence

`tests/fixtures/paris-recorded.json` is a sanitized, explicitly historical recording
of the approved real Gemini 3.5 Flash-Lite response. It is test-only and never
substituted for a user's generation. Its four dates, seven activities and EUR 1782
total including EUR 250 reserve still pass the original validator. The new quality
gate rejects it with 13 findings, including early arrival planning, sparse full
days, missing concrete Food coverage, lunch gaps, short transfer buffers, a short
description, an overloaded departure morning and the 09:00 Orsay visit.

A separately authored offline candidate has nine activities: two arrival, three
on each full day, and one departure activity. It adds a real food-focused activity,
uses 10:00–12:00 for Orsay, improves buffers/meal space and keeps departure activity
within the morning window. It passes both validators with the **same** EUR 1782
total and EUR 250 reserve. Relaxed and packed candidate variants also pass. These
are authored fixtures, not claimed new Gemini results; no plan is silently repaired.

New tests cover: recorded-response rejection, pace targets, single/two-day policies,
meaningful activity counts, interest-vs-expense distinction, duration ranges,
walking/access buffers, meal space, duplicate venues, official opening/closure/
last-admission bounds, unverified venues, prompt brief wiring, injection of fake
verification metadata, unchanged cost arithmetic and editorial-example consistency.
Integration tests prove quality failure prevents save, retains the archived input,
makes no implicit retry, and stores quality metadata durably for accepted trips.

## Review readiness and limits

The implementation is ready for final code/design review. All 39 automated tests,
lint, type-check, production build, format and whitespace checks passed. Production
HTTP checks passed for 13 routes; public build assets passed a private-value scan.
The itinerary was checked at 360, 390, 768, 1440 and 1920px without horizontal
overflow, with desktop/mobile screenshots saved under `docs/screenshots/`.
The updated prompt has now had one explicitly approved live check. It improved
detail, Food coverage and Orsay timing but failed the unchanged quality gate on one
declared buffer; meal-cost categorization, dinner timing and vague venues remain
manual findings. **Live quality sign-off is not passed.** One sample does not
establish reliability or a rejection rate. A further live check requires new approval.
The prior successful live result demonstrates the original pipeline only and now
serves as a regression case for the stronger rules.

Only one venue has a manually checked hours reference. Travel times, prices,
coordinates and most venue hours remain estimates. Exact transport timing and
semantic preference verification are absent. These conservative rules may reject
legitimate unusual schedules, repeat visits or activities whose wording is not
recognized. More destinations, interest combinations and long trips need evaluation.
No claim of complete venue verification or production deployment is made.

No PayPal, refunds, recovery, Bryntum, AI editing, Milestone 2B, deployment or push
was added. The budget algorithm, authentication, saved drafts, ownership checks,
quota controls and persistent generation lifecycle remain in place.
