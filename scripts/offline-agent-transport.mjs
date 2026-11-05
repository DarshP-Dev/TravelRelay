// Explicit Node preloader for local production-browser/HTTP QA ONLY.
// Never imported by application code, never a runtime success fallback.
import assert from "node:assert/strict";
import path from "node:path";
assert.equal(process.env.TRAVELRELAY_OFFLINE_QA, "true");
assert.equal(process.env.OPENAI_API_KEY, "offline-agent-qa-key");
assert.equal(process.env.DATABASE_DRIVER, "pglite");
assert.ok(
  path
    .basename(process.env.LOCAL_DATABASE_PATH || "")
    .startsWith("agent-ui-review-"),
);
const origin = new URL(process.env.APP_URL).origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const realFetch = globalThis.fetch;
globalThis.fetch = async (request, init) => {
  const url = new URL(
    request instanceof Request ? request.url : String(request),
  );
  if (url.origin === origin) return realFetch(request, init);
  if (
    url.origin !== "https://api.openai.com" ||
    url.pathname !== "/v1/responses"
  )
    throw Error("Offline QA blocked an external request.");
  const payload = JSON.parse(
    String(
      init?.body ?? (request instanceof Request ? await request.text() : "{}"),
    ),
  );
  assert.equal(payload.model, "gpt-6.1-sol");
  assert.equal(payload.reasoning.effort, "medium");
  assert.equal(payload.text.format.name, "travelrelay_assistant");
  const context = JSON.parse(payload.input),
    text = context.request.toLowerCase(),
    days = context.trip.days,
    budget = context.trip.budget;
  if (text.includes("offline quota"))
    return Response.json(
      {
        error: {
          message: "Offline fixture: quota exhausted",
          type: "rate_limit_exceeded",
        },
      },
      { status: 429 },
    );
  const blank = {
    activityId: null,
    dayId: null,
    title: null,
    description: null,
    category: null,
    location: null,
    city: null,
    startMinute: null,
    durationMinutes: null,
    bufferBeforeMinutes: null,
    costMinor: null,
    currency: null,
  };
  const money = (n) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: budget.currency,
    }).format(n / (budget.currency === "JPY" ? 1 : 100));
  let response = {
    answer: `OFFLINE QA FIXTURE — Your saved plan has ${money(budget.remainingMinor)} ${budget.currency} genuinely unallocated and a separate ${money(budget.reserveMinor)} emergency reserve. Food and transport estimates already sit within their inclusive allocations. No payment is recorded.`,
    activityIds: [],
    uncertainties: [
      "Offline mocked-provider response for UI testing; not evidence of a new live AI result.",
    ],
    proposal: null,
  };
  if (text.includes("relaxed") && days[2]?.activities.length >= 4) {
    const day = days[2],
      remove = day.activities[2],
      move = day.activities[0];
    response = {
      ...response,
      answer:
        "OFFLINE QA FIXTURE — I suggest leaving the canal walk out and starting the morning neighborhood walk half an hour later. Lunch and dinner remain. Review every changed time and estimate before approving; nothing has been applied.",
      activityIds: [move.id, remove.id],
      proposal: {
        summary: "Offline QA: a calmer third day, retaining substantial meals.",
        actions: [
          { ...blank, type: "remove_activity", activityId: remove.id },
          {
            ...blank,
            type: "move_activity",
            activityId: move.id,
            startMinute: move.startMinute + 30,
          },
        ],
      },
    };
  } else if (text.includes("cheaper")) {
    const day = days[0],
      dinner = day.activities.find((a) => a.category === "food");
    if (dinner)
      response = {
        ...response,
        answer:
          "OFFLINE QA FIXTURE — This proposes a lower group dinner estimate for review. It is not a verified menu or price, and the reserve remains protected.",
        activityIds: [dinner.id],
        proposal: {
          summary: "Offline QA: review a cheaper first-night dinner estimate.",
          actions: [
            {
              ...blank,
              type: "update_activity",
              activityId: dinner.id,
              costMinor: Math.max(0, dinner.costMinor - 2000),
            },
          ],
        },
      };
  }
  return Response.json({
    id: "resp_OFFLINE_QA",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: "gpt-6.1-sol",
    service_tier: "default",
    error: null,
    output: [
      {
        type: "message",
        id: "msg_OFFLINE_QA",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(response),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1200,
      output_tokens: 800,
      total_tokens: 2000,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 300 },
    },
  });
};
