# Milestone 6A — infrastructure readiness validation

Historical checkpoint. The current hosting choice is documented in
[Milestone 6B](milestone-6b-validation.md); the proposed paid Render service was
never created and is no longer the deployment target.

**Local preparation: PASS. Public deployment: NOT PERFORMED.**

The implementation preserves the existing generation, itinerary editing,
assistant, TripWallet, PayPal Sandbox and recovery workflows. No live model,
OAuth, PayPal financial or registration request was made. No infrastructure
resource was purchased/provisioned; no hosted database was connected or migrated.

## Checkpoint and changes

Branch: `codex/milestone-6a-deployment-readiness`, based on pushed checkpoint
`b5e55d3`. Its ancestry includes Milestone 4A `d844c13`, Milestone 4B `9be094d`,
FX refresh `9e1f1dd`, Milestone 5 `be4dd8a`, quote separation `86fa445` and the
final acceptance/reference backup `b5e55d3`. Approved commits were not rewritten
or merged destructively. This milestone is committed locally with DarshP-Dev
attribution; pushing remains unauthorized.

- Prepared `render.yaml`: one Node 24 web service, 1 CPU/2 GB, no disk, manual
  deploys, migration pre-deploy and 300-second drain. YAML syntax and expected
  safety settings were checked locally; the real Render Blueprint/account
  validation has not been performed.
- Added shared production guards: exact HTTPS origin, no public PGlite override,
  TLS-verified PostgreSQL, no custom preloaders/QA flags or public secret keys,
  and Sandbox-only PayPal/demo settings. Explicit local production-preview QA
  continues to work. No design or application-feature changes were made.
- Added provider-free `deploy:check`, full migration-manifest checks, an uncached
  sanitized `/api/health`, bounded PostgreSQL pool and sanitized idle errors.
  The prepared PostgreSQL migration path uses a dedicated direct connection
  and session advisory lock. Its real hosted execution is an approval gate.
- Added a shared fixed-key SQL webhook admission bucket, at most 120/minute,
  before provider signature verification. Existing body limits, signatures,
  authoritative resource reads, idempotency and audit history are unchanged.
- Added a reusable database contract and explicitly gated disposable PostgreSQL
  harness. No new migration or modification to `0000`–`0011` was necessary.
- Documented hosting alternatives, estimated costs, free-tier limits, environment
  checklist, signing, role/network controls, backup/restore and financial-safe
  rollback. See [deployment.md](deployment.md).

## Automated results

| Check                                      | Result                                           |
| ------------------------------------------ | ------------------------------------------------ |
| Full regression suite                      | 159 tests, zero failures/skips                   |
| Existing production recovery/commerce HTTP | 67 assertions passed                             |
| New production infrastructure HTTP         | 19 assertions passed                             |
| Lint                                       | Passed, zero warnings                            |
| Type-check                                 | Passed                                           |
| Formatting                                 | Passed                                           |
| Production Webpack build                   | Passed; 22 static pages and dynamic health route |
| Migration manifest                         | Twelve ordered SQL migrations, through `0011`    |
| Local migration/replay/record preservation | Passed on isolated PGlite                        |
| Hosted PostgreSQL/TLS/roles/pooler         | Not run; disposable target approval required     |
| Credential/client-asset scan               | Zero violations                                  |

The new regression coverage includes configuration refusal, clean-checkout
preflight, safe health failures, Secure/HttpOnly/SameSite cookies, exact schema
checkpoint rejection, owner isolation, optimistic concurrent draft writes,
transaction rollback, immutable/unique financial events, repeated migration
preservation and shared/concurrent webhook admission. Existing tests retain
forged signatures, duplicates, out-of-order notifications, currency/budget checks,
concurrent financial claims, failed/uncertain operations and explicit recovery.

## Background execution findings

One actual isolated worker process was hard-killed during a mocked model request.
The reopened database retained its in-progress claim without a completed plan.
After the existing five-minute stale threshold (clock evidence advanced only in
this isolated fixture), reads marked the job/audit interrupted. Repeated reads
and database reopening made zero model calls. One explicit owner retry, even
with two simultaneous worker starts, made exactly one mocked request and saved
the fully validated recorded itinerary. Foreign-owner retry was denied.

The production Node HTTP test returned 202, then shut down while its mocked
assistant request was still in flight. Next drained `after()` and persisted the
completed answer with no itinerary edit. Windows used an IPC bridge into Next's
installed SIGTERM handler; no claim is made about POSIX signal delivery or an
actual Render redeploy. The retained latency/lease tests also cover the recorded
63.7-second generation, premature reveal prevention and late-worker fencing.

The system provides **persisted, recoverable application state**, not an
independently durable provider task queue. A crash can lose a billed result;
usage may be unknown. No automatic retry/fallback was added. A real 240-second
host window, 300-second signal grace and restart/instance swap require simulated
host acceptance before public judging.

## Browser smoke findings

An isolated production server on loopback used a separate fresh QA database and
explicitly mocked model, FX and PayPal transports. Its records do not represent
new real financial acceptance. The historical Paris database and pending live
AI review were not opened or changed by this test.

Verified login, Dashboard, saved workspace/Overview, chronological Itinerary,
loaded Bryntum Community schedule, mobile Recovery, refreshed TripWallet, and
browser-visible `{ "status": "ready" }`. Reserve, native capture/refund history
and separate planning funds remained consistent with this fixture. No checkout,
refund or live assistant action was submitted through the browser. Responsive
checks at 360/390/768/1440 CSS pixels showed no page-level horizontal overflow;
the 360px wallet also passed. Viewport overrides were reset. Screenshots remain
ignored local QA evidence, not public deployed records.

The retained Dashboard description still includes an outdated statement that
checkout is not connected; this is a copy limitation for later product polish,
not a disabled capability. No visual redesign was included in infrastructure work.

## Still required before public launch

1. Approve pushing this branch and the Render/Neon accounts, region and actual
   cost cap. The guide's USD 25–40/month envelope is a planning estimate, not an
   account quote or purchased resource. Render Free sleeping is unsuitable.
2. Approve and configure an empty disposable managed PostgreSQL target, then run
   the prepared migration/contract harness and backup/restore drill. Local PGlite
   does not verify real PostgreSQL TLS, roles, advisory locks or pooling.
3. Approve production database/roles/migration, hostname, protected environment,
   demo flags and first deployment. Verify actual HTTPS cookies/origin/proxy-IP
   sanitization, memory, full-duration background lifecycle and failure recovery.
4. Separately approve Sandbox webhook registration and real signed delivery.
   The existing postback method cannot validate PayPal simulator mock events.
   Edge/body/slow-client protection is also required; the SQL admission limit
   alone is not DDoS protection. No webhook delivery is claimed verified.
5. Approve any host-specific live model/payment acceptance requests separately.
   Agree judge account/support procedures: email verification, password reset,
   OAuth and MFA remain unavailable. No real supplier availability is verified.

No private environment file, local database, session record, credential value or
private provider evidence belongs in the commit/deployed checkout. The secret
scan checks configured private values without printing them and scans production
client assets. All existing financial/recovery records remain preserved.

Milestone 6B, pushing and deployment were not started.
