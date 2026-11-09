# Generation hosting and recovery

## Vercel Fluid Compute contract

Milestone 6B targets native Next.js on Vercel Hobby with Fluid Compute, Node.js
24 and hosted Neon PostgreSQL. The three `/api/trips/{id}/generation`,
`/assistant` and `/recovery` routes retain literal Node `maxDuration = 240`
exports. Next's production manifest confirms those values. They fit Hobby's
documented 300-second Fluid ceiling. The route duration includes all work,
including `after()`, rather than starting a second clock after the response.
Turning off Fluid can lower the available maximum below 240 seconds.

Next delegates `after()` lifetime to the Vercel request context. In a function,
the underlying `waitUntil` work is cancelled at the function timeout. No custom
timer, detached promise, internal HTTP request, always-on worker or SIGTERM
grace is relied upon. A static export or an Edge-only adapter cannot provide
this app's required runtime. Native function grouping is host-controlled.

Sources: [Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration),
[Vercel `after()` / `waitUntil`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package),
and the installed Next `after` documentation. See [deployment.md](deployment.md)
for eligibility, quotas and the manual approval sequence.

## Timing and admission

The owner-authenticated mutation validates and stores its intent before returning
saved job status. The response does not wait for the model. `after()` claims the
job with conditional SQL; every invocation and provider shares the same database
quotas. The existing worker timeout is 150s; the project lease lasts 180s;
the stale gate is five minutes. The 240s invocation budget provides margin for
startup, DB access, validation and persistence. The recorded 63.7s Sol result
fits the unchanged model timeout. Actual platform capacity and cold starts still
require a host check.

The browser polls active jobs every two seconds with a 15s per-request deadline.
Focus, reconnect and a lost mutation response lead to a saved-status check,
not an automatic resend. Only explicitly admitted model attempts can consume
provider quota. Polling, opening a card, approval, rejection and draft saving
do not call a model. GPT-6.1 Sol/medium and manually selected Gemini remain
unchanged; no fallback or automatic repair request exists.

## Recovery

- Refresh, navigation or sign-out does not cancel admitted work. After signing
  in again, read the owned trip from Dashboard/My Trips. Original archived wizard
  input, confirmed destination and assistant drafts/history remain stored.
- Provider, schema, schedule, quality and budget failures keep the safe error and
  attempt audit. No partial itinerary is revealed. Validate and persist the full
  result atomically before marking success. The user can explicitly retry within
  the existing limits, or copy input into a new draft. The labeled public example
  is a separate read-only alternative.
- A killed function cannot resume an in-flight provider call. The next owner
  status read after five minutes marks stale work failed/interrupted. Expired
  worker leases and version/claim fencing prevent a late result from overwriting
  newer state. Only a new explicit request starts a retry. Unobserved model usage
  may already have been billed and remains unknown in audit records.
- Redeploying or rollback can interrupt a function. Keep release SQL compatible,
  avoid deployments during the demonstration, and use durable status reads to
  reconcile. Do not manually rewrite job, payment or refund history to restart.

This is **recoverable database state, not an independent durable task queue**.
The current requirement does not justify adding a paid queue. If future use
requires automatic completion through host loss, that is a separate architecture
and spending decision.

## Evidence and hosted check

The retained production HTTP test runs real `next start` on an isolated database
with mocked provider transport. It returns before the assistant finishes, then
persists the completed response while Next drains its `after()` work. The Windows
signal bridge verifies Next's local handler; Vercel does not use that bridge.
An actual hard-terminated fixture worker restores interrupted state, polling
makes zero model calls, and duplicate worker starts after one explicit retry
make only one mocked request. The route-duration and trace checks inspect the
actual native Next build inputs, not Vercel's final deployment output.

After separate hosting approval, verify Fluid is enabled and all three deployed
routes have the expected durations. Use a separate disposable Next.js fixture
project with no live provider credentials for the long-window probe: return a
short 202, have a 240s `after()` callback wait over 60 seconds, record a completion
marker, and verify it is written once after the response. Exercise termination and
restart with mock transport in isolated data. The public TravelRelay project must
never use the local QA preloaders or a fake-success provider. Hosted PostgreSQL,
proxy/HTTPS behavior and actual end-to-end live calls each have separate approval
and acceptance gates.
