# Generation hosting and recovery

Milestone 2B preserves the existing execution architecture. **Not deployed or
host-verified yet.** A successful local build is not evidence that a hosting plan
supports long-running background work.

## Supported execution contract

Use the production Next.js Node server (`npm run build`, then `npm start`) with
hosted PostgreSQL, or a Node platform adapter that explicitly supports Next.js
`after()` for the entire **240-second** configured route execution window. A
static export or platform that freezes work once HTTP responses finish cannot
run this application. PGlite is local single-process QA only.

The browser's generation POST saves/queues the request and returns immediately.
`after()` invokes the existing owner-scoped worker. Browser polling requests are
short reads every two seconds; each browser request has a 15-second deadline.
Returning online or focusing the page checks status again, without starting a
model request. A lost POST response offers a saved-status check, not an automatic
retry. Individual days are hidden until validation and atomic persistence finish.

The provider has a 150-second deadline. Shared admission has one 180-second active
worker lease; the job becomes recoverably failed after five minutes without an
update. The original 63.727-second Sol response fits these unchanged limits. The
240-second runtime contract leaves headroom for validation/database writes; it
is not a promise that every plan will finish within that window.

## Hosted operation strategy

1. Configure the exact HTTPS `APP_URL`, one shared `AUTH_SECRET`, hosted
   `DATABASE_URL`, optional migration `DIRECT_URL`, provider/model settings and
   server-only keys through the host's protected runtime environment. Apply the
   committed migrations before admitting traffic. Never copy local QA credentials
   or databases into a public demo.
2. Keep at least one healthy application instance available; prevent scale-to-zero
   or sleep while background work is active. Verify outbound provider access,
   SQL connectivity and suitable instance resources. All replicas must share the
   same database so quota, user sessions, claims and job state are shared.
3. On managed/serverless hosting, verify the actual account/plan's background
   lifetime and route duration; the source `maxDuration = 240` does not override a
   hosting limit. If unsupported, use a long-lived Node service/container rather
   than pretending the request succeeded. No host has been provisioned here.
4. Drain traffic before planned restarts/deploys, send SIGTERM/SIGINT, and allow
   up to 240 seconds for in-flight `after()` work. The installed Next.js guide
   documents callback draining with `next start`; its short generic drain examples
   are insufficient for TravelRelay's 150-second model deadline. Verify the actual
   platform's shutdown grace period. Hard termination still uses recovery below.
5. Monitor safe job/attempt status, timings, validation failures, quota denials and
   worker interruptions. Do not log keys, session cookies, complete prompts or
   dietary/accessibility text. The persisted attempt audit retains usage/cost when
   returned and null when unknown; it cannot establish whether an interrupted
   provider request was billed.

## Recovery behavior

- Browser refresh, navigation or sign-out does not cancel admitted work. Reopen
  the owned trip from Dashboard/My Trips after signing in to read saved progress.
  The original archived wizard draft and confirmed city remain stored.
- Provider/schema/quality/budget failures never reveal a partial plan. They keep
  the source intent, safe error and attempt audit. The UI offers an explicit retry
  (up to three attempts per phase, still subject to shared/user quotas), or a new
  draft copied from the saved preferences. There is no automatic provider fallback.
- An abrupt process loss cannot resume an in-flight SDK call. On the next status
  read after five minutes, stale queued/choosing/generating/validating work is marked
  interrupted/failed; the user decides whether to retry. Merely reading status,
  logging in or opening a card never issues a model call.
- Conditional SQL claims and attempt/timestamp fencing prevent an old worker from
  publishing after a retry supersedes it. Completion and the full itinerary commit
  in one transaction. No manual database edits are part of recovery.
- If attempts are exhausted, adjust a copy of the saved input; shared quotas still
  apply. The public labeled example remains read-only and is never substituted
  into the user's failed trip.

## Limits and release verification

This is persistent, recoverable job state, **not an independently durable task
queue**. A crash may lose a model result and the next explicit retry may incur a
new charge. Unattended guaranteed completion across host loss would require a
separate durable worker/queue and additional operational validation; that is not
claimed by Milestone 2B.

Before public deployment, verify the host's PostgreSQL, secret boundary, HTTPS,
trusted proxy/IP handling for auth rate limits, background lifetime, graceful
drain and crash recovery with an offline provider boundary. A hosted live model
check requires separate approval. Do not run live harnesses as build/deploy hooks.

References: installed version-matched Next.js `after` and self-hosting guides in
`node_modules/next/dist/docs/01-app/`; [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after)
and [self-hosting](https://nextjs.org/docs/app/guides/self-hosting#after).
