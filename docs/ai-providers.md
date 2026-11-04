# Milestone 2A: OpenAI primary and manual Gemini backup

Implemented November 4, 2026 and initially validated offline. The first live attempt
failed authentication. A newly approved [single real Sol itinerary request](milestone-2a-sol-paris-result.md)
returned HTTP 200 but was rejected by a classifier false positive on “Temple” in
a street name. Validators remained unchanged. Existing reliability policies and regression fixtures
remain intact; Milestone 2B is not included.

## Provider boundary and defaults

`src/server/model.ts` preserves `TripModel.propose/generate`. It now selects exactly
one adapter. `src/server/ai/prompts.ts` holds the shared planning instructions,
strict internal schemas and quality brief; both providers receive identical user
intent/base/policies. Neither adapter saves or repairs an itinerary.

| Configuration             | Default / behavior                                             |
| ------------------------- | -------------------------------------------------------------- |
| `AI_PROVIDER`             | `openai`; only `openai` or `gemini` accepted                   |
| `OPENAI_MODEL`            | `gpt-6.1-sol`; other OpenAI models rejected for this milestone |
| `OPENAI_REASONING_EFFORT` | `medium`; other efforts rejected for this milestone            |
| `OPENAI_API_KEY`          | Server-only, ignored local file / protected production secret  |
| `GEMINI_MODEL`            | `gemini-3.5-flash-lite` when backup selected                   |
| `MODEL_NAME`              | Legacy Gemini alias only if `GEMINI_MODEL` is unset            |
| `GEMINI_API_KEY`          | Only used when `AI_PROVIDER=gemini`                            |

Provider selection is a deliberate maintainer configuration change plus restart,
not a frontend credential form or automatic fallback. Missing primary credentials
do not use the configured Gemini key. GPT-6 Astra is never selected. A manually
changed provider can continue a validated confirmed base because the internal DTO
and acceptance pipeline are identical; each phase's provider/model is recorded.

The official `openai` SDK 7.50.0 requires Node 22+; Node 24 remains the validated
runtime. Its Responses request uses `zodTextFormat`, strict JSON Schema, explicit
medium reasoning, `service_tier:default`, `store:false`, no tools, no streaming or
background response, fixed `https://api.openai.com/v1`, 150-second timeout/abort,
24KB planning-input bound, 8192 proposal / 32768 itinerary output-token caps and
`maxRetries:0` at client and call boundaries. Reasoning consumes the output cap.
SDK logging is explicitly off; environment endpoint/log overrides cannot redirect
the key or enable payload logging.

The Gemini adapter preserves official `@google/genai`, fixed Developer API,
compact provider schema, low/medium thinking, 2048/32768 caps, timeout, one transport
attempt, disabled continuation and the same strict server schemas. No changes to
the existing provider grammar or itinerary DTO were necessary.

Refusals, non-completed/truncated responses, invalid JSON/schema, network errors,
429/quota, authentication/configuration rejection and upstream errors fail safely.
User-facing errors omit provider bodies/keys. No error causes another request,
provider switch or model fallback. Retrying remains an explicit job action.

## Acceptance and persistent audit

The unchanged acceptance order is strict parse → deterministic buffer normalization
inside sufficient scheduled gaps → strict schema/domain/budget reconciliation →
meal/location/pace/interest/venue quality → atomic itinerary/job save. Activity times
are never silently moved. Failed outputs do not become completed trips or examples.

Migration `0003_bent_the_hood.sql` adds `trip_generation_attempt`. Each admitted
phase/attempt records owner, trip/job, provider/model, timestamps, status, nullable
usage, stage checks, correction metadata and a safe error. Usage persists immediately
after the SDK response, before JSON/schema/quality acceptance, so rejected output
still retains its reported consumption. Audit rows never contain API keys, raw
provider errors, full prompts, response text or hidden reasoning.

Owner-scoped generation reads include only that trip's audit rows; unauthorized
requests cannot access their metadata. Accepted and failed audit records survive
SQL close/reopen. Stale attempts are labeled interrupted; late workers cannot
publish over a newer lease and their separate attempt records can be superseded.
An abrupt crash/network failure before receiving usage leaves consumption unknown,
not zero. Metering is best-effort provider-reported accounting, not a billing ledger.

The existing global minute/Pacific-day, per-user hourly, one-worker admission and
explicit retry limits apply across both providers. Switching providers does not
reset those counters. Other applications/account usage remains outside these limits.
No provider API call occurs during signup, normal reads, build or offline preflight.

## Tokens and estimated cost

`ModelUsage.inputTokens` and `outputTokens` are normalized across providers.
**Output includes reasoning once**; `reasoningTokens` and `visibleOutputTokens`
show its breakdown. Gemini candidates + thoughts become total generated output;
OpenAI output already includes reasoning, so it is not added again. The older
`promptTokens`/`thinkingTokens` aliases remain for local report compatibility.
Missing counts remain absent and unknown cost is `null`, never a fabricated zero.

Standard text reference rates, checked November 4, 2026, USD per million tokens:

| Model                 | Uncached input | Cached input | Output including reasoning |
| --------------------- | -------------: | -----------: | -------------------------: |
| GPT-6.1 Sol           |           2.00 |         0.10 |                      10.00 |
| Gemini 3.5 Flash-Lite |           0.30 |         0.03 |                       2.50 |

OpenAI reported cache writes use 2.50 (30m) / 5.00 (12h) instead of ordinary input
rates, so cached reads/writes are not charged twice. Missing cache counters assume
none. Invalid cache counts or nonstandard returned OpenAI tiers yield unknown cost.
The prompt bound keeps this workload below long-context pricing thresholds.
Estimates exclude taxes, account discounts/credits, regional surcharges and tools;
Gemini uses a paid-rate reference even when an account may qualify for free usage.
These USD API estimates are separate from the traveler's currency/budget and are
not TripWallet expenses, payment records or invoices.

Sources: [OpenAI model capabilities](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[reasoning usage](https://developers.openai.com/api/docs/guides/reasoning),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Gemini Developer API pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).
Account model access, credits and actual charges are not verified by offline tests.

## Offline validation and controlled-test readiness

The original 49 tests remain. Six additional tests cover provider/configuration
defaults and forbidden models, SDK wire requests, identical prompts/data, strict
schemas, refusals/incomplete/malformed responses, sanitized API/network failures
without retries, token/cost/cache arithmetic, and both providers through real local
auth/SQL acceptance/rejection/ownership/persistence. Test transports use fake keys
and wire fixtures only. Authored acceptable candidates are clearly separated from
the unchanged rejected real Paris recording; no recorded response was rewritten.
All **55 tests**, lint, type-check, production build, formatting and whitespace
checks passed. The audit migration was generated/applied locally. Production HTTP
checks passed for 13 routes, and all 23 public assets passed the configured-private-
value/transport-boundary scan. Results are in [validation.md](validation.md).

The offline preflight confirms the original London → Paris scenario: Apr 15–18,
2027; two travelers; EUR 2500 entire trip; balanced; Culture/Food; neighborhood walks
and one art museum; avoid nightclubs and multi-city travel. The original recorded
Paris proposal is revalidated/reused, so no additional proposal request is needed.

```powershell
npx tsx scripts/check-live-generation.ts --preflight --reuse-proposal --quality-check --provider=openai
```

At implementation time `OPENAI_API_KEY` was not configured locally. After one
placeholder-key rejection, the user configured a working key and approved one
more request, now completed. Future test execution still requires credentials in
ignored `.env.local` and **after explicit approval for exactly one request**, run:

```powershell
npx tsx scripts/check-live-generation.ts --confirm-live --reuse-proposal --quality-check --provider=openai
```

The harness hard-limits the selected transport to one Sol itinerary call, verifies
the fixed official endpoint, never retries, and preserves existing Gemini reports.
It records raw JSON, provider usage, USD estimate, validator hashes, stage audits,
normalization, budget, complete-trip persistence or rejected-trip absence and source
draft/session/owner checks in ignored `.test-data/live-openai-paris-latest.json`.
This is an in-process application-layer check, not a hosted browser/deployment test.
The latest approved attempt is consumed; no further live request is authorized.
Sol API access, complete structured output and a 63.727-second response are now
demonstrated. The full quality gate still rejects a street-name classifier false
positive; free-text reserve narration also needs attention. Details and usage/cost
evidence are in the latest result report. No validator was changed to make it pass.

The local audit migration has been applied. Other checkouts should stop the dev
server and apply `npm run db:migrate`, then restart. Production later needs the
same committed migration, protected OpenAI
secret, exact HTTPS origin, hosted PostgreSQL and adequate background-route duration.
Judges use the configured website/account, not their own provider credentials.
No deployment, push or Milestone 2B functionality is included.
