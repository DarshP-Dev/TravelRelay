# Milestone 6B — Vercel Hobby readiness

November 9, 2026. **Local preparation: PASS. Hosted acceptance and Hobby
eligibility: pending.** The complete application is prepared for native Next.js
on Vercel Hobby with Fluid Compute, Node.js 24 and Neon Free. No app feature
requires a paid hosting add-on in the proposed architecture. Free plan access,
final bundling, available quotas and the intended use remain host-dependent.

The branch `codex/milestone-6b-vercel-hobby` descends from `548feb1`, preserving
the approved 6A guards and the earlier implementation and financial checkpoints.
Changes are committed locally with DarshP-Dev attribution. No paid or free host
resource was provisioned; no deployment, push, hosted database connection or
migration, webhook registration, live AI or PayPal API call was made.

## Prepared changes

- Removed the paid Render Blueprint. Native `vercel.json` enables Fluid, disables
  automatic Git deployment and runs configuration preflight, a Webpack build,
  and production artifact verification. It contains no secrets or database
  mutation command. Node 24.x is pinned in package metadata.
- Retained literal Node 240-second generation, assistant and recovery exports;
  60-second commerce/webhook and 30-second health/wallet budgets are unchanged.
  No alternate paid queue, provider, automatic retry or fallback was introduced.
- Vercel runtime requires a pooled TLS-verified Neon URL, exact HTTPS origin and
  no local database or direct/admin/test migration credentials. A five-client
  per-instance pool attaches Vercel's official lifecycle hook and uses a one-second
  idle timeout. Better Auth uses the Vercel-forwarded client-IP header there.
- All twelve migrations through `0011` are untouched. The dynamic health
  function explicitly traces the SQL and journal. Migrations remain manual,
  on an approved direct connection outside Vercel; the CLI rejects on-platform
  migration attempts. Existing PGlite local development and QA continue to work.
- Git, upload and trace exclusions protect local configuration/data. The retained
  credential scanner checks source and browser assets without printing secrets.
  PayPal SDK v6, server-side operations and the signed `/api/paypal/webhook`
  retain their contracts and security boundaries.

## Validation results

| Check                                  | Result                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Full automated regressions             | **161 passed**, zero failures/skips                                                                                                 |
| Production commerce/recovery HTTP      | **67 assertions**, all external transports mocked                                                                                   |
| Production infrastructure HTTP         | **19 assertions**, real local Next `after()` completion with mocked model                                                           |
| Lint, type-check, formatting           | Passed                                                                                                                              |
| Local Webpack production build         | Passed on Node.js 24.22.1                                                                                                           |
| Deployment preflight                   | Passed with a clean fixture checkout and placeholder Neon/model settings; local/admin credentials and on-platform migration refused |
| `vercel.json`                          | Configuration validated against Vercel's published schema                                                                           |
| Production manifest/trace verification | 31 Next route traces inspected; all expected durations and twelve migration assets plus journal present                             |
| Largest route trace                    | 22,818,506 raw bytes locally; final Vercel grouping and gzip sizes not measured                                                     |
| Private artifact scan                  | Zero traced private files and zero credential violations                                                                            |
| Local database regressions             | Migration replay, transaction/ownership/ledger and interrupted-job persistence passed on isolated databases                         |

The existing hard-termination regression proves a killed worker cannot mark a
trip successful; saved state recovers with one explicit owner retry and duplicate
starts cannot create a second model attempt. The production HTTP test verifies
that a response returns before its admitted `after()` work completes and that the
result persists. This local test does not reproduce Vercel's suspension or full
240-second invocation window. Vercel's documented Next `after()`/`waitUntil`
support and 300-second Hobby maximum establish compatibility at the configuration
level. A separately approved hosted probe must verify the actual project.

## Release gates

- The GitHub repository is public and personally owned, so the Git-organization
  restriction does not apply. Vercel's personal/non-commercial use policy does
  not clearly settle a prize-bearing hackathon with a Sandbox checkout; confirm
  eligibility for this exact use. No support message was sent.
- Confirm the Hobby project uses Fluid and the final native output fits the 12
  grouped-function cap. A local Next trace is not one deployed function.
- Approve an empty disposable Neon target and validate migrations, role grants,
  TLS, pooling, cold start and restore. Approve the demo target separately before
  migrating. Do not reuse local historical payment databases.
- Approve the canonical HTTPS origin, protected environment, project setup and
  first deploy. Verify auth/proxy behavior, `/api/health`, hosted post-response
  lifetime and provider-free public example before sharing access.
- Approve signed Sandbox webhook registration and live model/payment acceptance
  separately. Actual SDK approval and signed delivery on Vercel are not yet proven.
- Track included usage and stop if free limits are exhausted. No paid upgrades
  are part of this release plan. Existing AI provider costs are separate from hosting.

See [deployment.md](deployment.md) for exact manual steps, protected environment
variables, current limits, policy sources and rollback. The prior [6A report](milestone-6a-validation.md)
is historical; the Render proposal has been retired.
