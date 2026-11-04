import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import { createTripModel, type ModelUsage } from "../src/server/model";
import { initialIntent } from "../src/lib/trip-intent";
import {
  budgetMinor,
  itineraryOutputSchema,
  validateItinerary,
  validateProposal,
} from "../src/lib/itinerary";
import { assessItineraryQuality } from "../src/lib/itinerary-quality";
import { venueReferences } from "../src/server/venue-references";
import { normalizeTravelBuffers } from "../src/lib/itinerary-normalization";
import { generationLimitsFromEnv } from "../src/server/generation-quota";

// Manual, opt-in check. Never included in npm test or run automatically.
// Uses isolated accounts/database; only the explicitly selected AI provider is external.
const preflight = process.argv.includes("--preflight");
const providerFlag = process.argv.find((arg) => arg.startsWith("--provider="));
assert.ok(
  providerFlag,
  "This manual harness requires --provider=openai or --provider=gemini explicitly.",
);
assert.ok(
  !providerFlag ||
    ["--provider=openai", "--provider=gemini"].includes(providerFlag),
  "Select an explicit supported provider; no provider substitution is permitted.",
);
const provider = process.argv.includes("--provider=openai")
  ? "openai"
  : "gemini";
const selectedModel =
  provider === "openai" ? "gpt-6.1-sol" : "gemini-3.5-flash-lite";
if (!preflight && !process.argv.includes("--confirm-live"))
  throw new Error(
    "Pass --confirm-live only after local key setup and approval. Gemini legacy mode permits proposal+itinerary; OpenAI requires one-request proposal reuse. No automatic retries.",
  );
nextEnv.loadEnvConfig(process.cwd());
const key =
  (provider === "openai"
    ? process.env.OPENAI_API_KEY
    : process.env.GEMINI_API_KEY) || "";
if (!key && !preflight)
  throw new Error(
    `Configure ${provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} locally. No request was made.`,
  );
const root = path.resolve(".test-data");
await mkdir(root, { recursive: true });
const directory = preflight
  ? path.join(root, "not-opened-preflight")
  : await mkdtemp(path.join(root, `live-${provider}-`));
const qualityCheck = process.argv.includes("--quality-check");
const reuseProposal = process.argv.includes("--reuse-proposal");
assert.ok(
  provider !== "openai" || (reuseProposal && qualityCheck),
  "OpenAI live check requires --reuse-proposal --quality-check: exactly one itinerary call.",
);
assert.ok(
  !qualityCheck || reuseProposal,
  "Quality checks must reuse the original proposal: exactly one itinerary request is authorized.",
);
const reportPath = path.join(
  root,
  provider === "openai"
    ? "live-openai-paris-latest.json"
    : qualityCheck
      ? "live-gemini-quality-latest.json"
      : "live-gemini-latest.json",
);
const previous = reuseProposal
  ? JSON.parse(
      await readFile(path.join(root, "live-gemini-latest.json"), "utf8"),
    )
  : null;
const maxRequests = reuseProposal ? 1 : 2;
const origin = "http://localhost:3000";
const secret = randomBytes(32).toString("base64url");
const password = randomBytes(24).toString("base64url");
let calls = 0,
  connection: Awaited<ReturnType<typeof openDatabase>> | undefined;
const usage: ModelUsage[] = [];
const httpErrors: {
  status: number;
  code?: string;
  param?: string;
  message: string;
}[] = [];
const outputs: unknown[] = [];
const responses: unknown[] = [];
const validatorHashes: Record<string, string> = {};
for (const file of [
  "src/lib/itinerary.ts",
  "src/lib/itinerary-quality.ts",
  "src/server/generation.ts",
  "src/server/model.ts",
  "src/server/venue-references.ts",
  "src/lib/itinerary-normalization.ts",
  "src/lib/itinerary-budget.ts",
  "src/lib/activity-semantics.ts",
  "src/server/ai/openai.ts",
  "src/server/ai/gemini.ts",
  "src/server/ai/prompts.ts",
  "src/server/ai/usage.ts",
])
  validatorHashes[file] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const report: Record<string, unknown> = {
  testedAt: new Date().toISOString(),
  provider,
  model: selectedModel,
  transport:
    provider === "openai"
      ? "official openai SDK / Responses API"
      : "official @google/genai SDK",
  scope:
    "Real auth/resource handlers, selected AI provider, validation and isolated persistent SQL; not a hosted deployment.",
  success: false,
  maxRequests,
  qualityCheck,
  validatorHashes,
};
const redact = (value: string) =>
  value
    .split(key)
    .join("[REDACTED]")
    .replace(/AIza[\w-]{20,}/g, "[REDACTED]")
    .slice(0, 1500);
function request(url: string, method = "GET", cookie = "", body?: unknown) {
  return new Request(origin + url, {
    method,
    headers: {
      cookie,
      origin,
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(response: Response) {
  const body = await response.json();
  assert.equal(
    response.status,
    200,
    body.error ?? "Application request failed.",
  );
  return body;
}
const model = createTripModel({
  provider,
  key,
  name: selectedModel,
  reasoningEffort: "medium",
  onUsage: (item) => {
    usage.push(item);
  },
  fetch: async (url, init) => {
    const endpoint = new URL(url instanceof Request ? url.url : String(url));
    assert.equal(
      endpoint.origin,
      provider === "openai"
        ? "https://api.openai.com"
        : "https://generativelanguage.googleapis.com",
    );
    assert.equal(
      endpoint.pathname,
      provider === "openai"
        ? "/v1/responses"
        : "/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    assert.ok(
      calls < maxRequests,
      "This check has reached its explicit provider request limit; no retry is permitted.",
    );
    if (provider === "openai") {
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(requestBody.model, "gpt-6.1-sol");
      assert.equal(requestBody.reasoning.effort, "medium");
      assert.equal(requestBody.text.format.strict, true);
      assert.equal(requestBody.max_output_tokens, 32768);
    }
    calls++;
    const requestStartedAt = new Date().toISOString();
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      responses.push({
        requestStartedAt,
        responseLatencyMs: Math.round(performance.now() - started),
        transportError: true,
      });
      throw error;
    }
    const headersLatencyMs = Math.round(performance.now() - started);
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    responses.push({
      status: response.status,
      requestStartedAt,
      headersLatencyMs,
      responseLatencyMs: Math.round(performance.now() - started),
      responseModel: body?.model,
      serviceTier: body?.service_tier,
      finishReason:
        provider === "openai"
          ? body?.status
          : body?.candidates?.[0]?.finishReason,
      usageMetadata: provider === "openai" ? body?.usage : body?.usageMetadata,
    });
    if (!response.ok)
      httpErrors.push({
        status: response.status,
        code:
          typeof body?.error?.status === "string"
            ? body.error.status
            : typeof body?.error?.code === "string"
              ? body.error.code
              : body?.error?.type,
        param:
          typeof body?.error?.param === "string" ? body.error.param : undefined,
        message: redact(
          String(body?.error?.message ?? "Unspecified provider error"),
        ),
      });
    else {
      const text = (
        provider === "openai"
          ? (body?.output ?? [])
              .filter((item: { type: string }) => item.type === "message")
              .flatMap((item: { content: unknown[] }) => item.content)
              .filter((part: { type: string }) => part.type === "output_text")
          : (body?.candidates?.[0]?.content?.parts ?? [])
      )
        .filter(
          (part: { thought?: boolean; text?: string }) =>
            !part.thought && part.text,
        )
        .map((part: { text: string }) => part.text)
        .join("");
      try {
        outputs.push(JSON.parse(text));
      } catch {
        outputs.push({ unparsedResponse: text.slice(0, 120000) });
      }
    }
    return response;
  },
});
const intent = {
  ...initialIntent(),
  review: true,
  step: 3,
  destination: "Paris, France",
  departure: "London",
  start: "2027-04-15",
  end: "2027-04-18",
  travelers: 2,
  budget: "2500",
  currency: "EUR" as const,
  scope: "entire" as const,
  pace: "balanced" as const,
  selected: ["Culture", "Food"],
  mustSee: "Neighborhood walks and one art museum",
  avoids: "Nightclubs and multi-city travel",
};
if (previous) {
  assert.equal(previous.model, "gemini-3.5-flash-lite");
  assert.deepEqual(
    previous.input,
    intent,
    "Only the original live-test preferences may reuse the proposal.",
  );
  const proposal = validateProposal(previous.providerOutputs[0], intent);
  assert.equal(proposal.city, "Paris");
  outputs.push(proposal);
  report.reusedLiveProposalFrom = previous.testedAt;
  report.previousRecordedRunUsage = previous.usage;
  if (!qualityCheck)
    await writeFile(
      path.join(root, "live-gemini-first-attempt.json"),
      JSON.stringify(previous, null, 2),
      { mode: 0o600 },
    );
}
if (preflight) {
  console.log(
    JSON.stringify(
      {
        provider,
        model: selectedModel,
        reasoningEffort: "medium",
        keyConfigured: Boolean(key),
        requestsMade: 0,
        maxRequests,
        reusedCity: (outputs[0] as { city?: string })?.city,
        input: intent,
        readyForOneRequestAfterApproval: Boolean(
          key && previous && maxRequests === 1,
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const planningModel = previous
  ? { ...model, propose: async () => outputs[0] }
  : model;
try {
  connection = await openDatabase({ directory });
  await connection.migrate();
  let app = createApplication(connection.db, {
    secret,
    origin,
    model: planningModel,
    generationLimits: generationLimitsFromEnv(process.env),
  });
  const signup = await app.authHandler(
    request("/api/auth/sign-up/email", "POST", "", {
      name: "Live generation QA",
      email: `live-${randomBytes(6).toString("hex")}@example.com`,
      password,
    }),
  );
  const identity = await json(signup);
  const userId: string = identity.user.id;
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join(";");
  const draft = await json(
    await app.handle(request("/api/drafts", "POST", cookie, {}), "drafts"),
  );
  const saved = await json(
    await app.handle(
      request(`/api/drafts/${draft.id}/complete`, "POST", cookie, {
        version: draft.version,
        data: intent,
      }),
      "drafts",
      draft.id,
      true,
    ),
  );
  const work: (() => Promise<void>)[] = [];
  async function act(action: string) {
    await json(
      await app.generationHandler(
        request(`/api/trips/${saved.id}/generation`, "POST", cookie, {
          action,
        }),
        saved.id,
        (task) => {
          work.push(task);
        },
      ),
    );
    const scheduled = work.shift();
    assert.ok(scheduled, "The real generation job must be queued.");
    await scheduled();
    return json(
      await app.generationHandler(
        request(`/api/trips/${saved.id}/generation`, "GET", cookie),
        saved.id,
        () => {
          throw new Error("GET must not start generation.");
        },
      ),
    );
  }
  report.input = intent;
  console.log(
    reuseProposal
      ? "Revalidating the previous real Paris proposal without another provider call…"
      : "Running one live city proposal with Gemini 3.5 Flash-Lite…",
  );
  const proposal = await act("start");
  report.proposalStatus = proposal.status;
  assert.equal(
    proposal.status,
    "awaiting_confirmation",
    proposal.error ?? "No city proposal was accepted.",
  );
  assert.equal(
    proposal.proposal.city,
    "Paris",
    "Do not confirm an unsolicited replacement city.",
  );
  assert.equal(proposal.proposal.startDate, intent.start);
  console.log(
    `Confirmed requested Paris base and dates; running one ${selectedModel} itinerary request…`,
  );
  const completed = await act("confirm");
  report.generationStatus = completed.status;
  report.generationAudits = completed.audits;
  report.generationError = completed.error;
  const trip = await app.trips.read(userId, saved.id);
  if (completed.status === "complete") {
    assert.ok(trip.itinerary);
    assert.equal(trip.itinerary.days.length, 4);
    assert.ok(trip.itinerary.totalMinor <= budgetMinor(intent));
    assert.equal(trip.itinerary.reserveMinor, 25000);
    if (qualityCheck) assert.ok(trip.itinerary.quality);
  } else
    assert.equal(
      trip.itinerary,
      null,
      "Rejected responses must never be saved as completed itineraries.",
    );
  assert.deepEqual((await app.trips.readDraft(userId, draft.id)).data, intent);
  report.itinerary = trip.itinerary;
  await connection.close();
  connection = await openDatabase({ directory });
  app = createApplication(connection.db, { secret, origin, model });
  assert.deepEqual(
    (await app.trips.read(userId, saved.id)).itinerary,
    trip.itinerary,
  );
  assert.deepEqual((await app.trips.readDraft(userId, draft.id)).data, intent);
  const restoredJob = await app.generations.read(userId, saved.id);
  assert.equal(restoredJob?.status, completed.status);
  assert.equal(
    restoredJob?.attempts,
    1,
    "There must be no silent itinerary retry.",
  );
  assert.equal(
    (
      await app.generationHandler(
        request(`/api/trips/${saved.id}/generation`, "GET", cookie),
        saved.id,
        () => {},
      )
    ).status,
    200,
  );
  assert.equal((await app.trips.list(userId)).length, 1);
  assert.equal(
    (
      await app.generationHandler(
        request(`/api/trips/${saved.id}/generation`),
        saved.id,
        () => {},
      )
    ).status,
    401,
  );
  await assert.rejects(app.trips.read("another-user", saved.id), /not found/);
  report.validation = {
    pipelineAccepted: completed.status === "complete",
    draftRetained: true,
    completedItineraryPersistedAfterReopen: completed.status === "complete",
    rejectedItineraryAbsentAfterReopen: completed.status !== "complete",
    generationStatusPersistedAfterReopen: true,
    itineraryAttempts: restoredJob?.attempts,
    ownerIsolation: true,
    sessionRestored: true,
  };
  assert.equal(
    completed.status,
    "complete",
    completed.error ?? "Itinerary validation failed.",
  );
  assert.equal(calls, maxRequests);
  report.success = true;
} catch (error) {
  report.error = redact(
    error instanceof Error ? error.message : "Live check failed.",
  );
  process.exitCode = 1;
} finally {
  report.modelRequests = calls;
  report.usage = usage;
  report.httpErrors = httpErrors;
  report.providerOutputs = outputs;
  report.providerResponses = responses;
  if (qualityCheck && outputs.length > 1) {
    const parsed = itineraryOutputSchema.safeParse(outputs[1]);
    report.schemaAudit = parsed.success
      ? { passed: true, rejectedFields: [] }
      : { passed: false, rejectedFields: parsed.error.issues };
    if (parsed.success) {
      report.rawQualityAudit = assessItineraryQuality(
        parsed.data,
        intent,
        outputs[0] as ReturnType<typeof validateProposal>,
        venueReferences,
      );
      try {
        const normalized = normalizeTravelBuffers(parsed.data, intent);
        report.normalizationAudit = normalized.normalization;
        const checked = validateItinerary(
          normalized.plan,
          intent,
          outputs[0] as ReturnType<typeof validateProposal>,
        );
        report.domainAudit = {
          passed: true,
          reserveMinor: checked.reserveMinor,
          totalMinor: checked.totalMinor,
          remainingMinor: budgetMinor(intent) - checked.totalMinor,
          budget: checked.budget,
        };
        report.qualityAudit = assessItineraryQuality(
          normalized.plan,
          intent,
          outputs[0] as ReturnType<typeof validateProposal>,
          venueReferences,
        );
      } catch (error) {
        report.domainAudit = {
          passed: false,
          error: redact(error instanceof Error ? error.message : String(error)),
        };
      }
    }
  }
  report.validatorsUnchanged = true;
  for (const [file, hash] of Object.entries(validatorHashes))
    if (
      hash !==
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex")
    )
      report.validatorsUnchanged = false;
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  if (connection) await connection.close();
  if (path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
  console.log(
    JSON.stringify(
      {
        success: report.success,
        model: report.model,
        modelRequests: calls,
        usage,
        httpErrors,
        error: report.error,
        reportPath,
      },
      null,
      2,
    ),
  );
}
