// Local production infrastructure test ONLY. No real external transport exists.
import assert from "node:assert/strict";
assert.equal(process.env.TRAVELRELAY_INFRASTRUCTURE_QA, "true");
assert.equal(process.env.OPENAI_API_KEY, "offline-infrastructure-key");
assert.equal(process.env.DATABASE_DRIVER, "pglite");
assert.match(process.env.LOCAL_DATABASE_PATH || "", /infrastructure-http-/);
const origin = new URL(process.env.APP_URL).origin;
assert.equal(origin, "http://127.0.0.1:3004");
// Exercise the installed Next SIGTERM handler on Windows too. Linux host signal
// delivery still needs acceptance on the real host; this is an IPC test bridge.
process.on("message", (message) => {
  if (message === "qa-graceful-stop") process.emit("SIGTERM", "SIGTERM");
});
const localFetch = globalThis.fetch;
globalThis.fetch = async (request, init) => {
  const url = new URL(
    request instanceof Request ? request.url : String(request),
  );
  if (url.origin === origin) return localFetch(request, init);
  assert.equal(url.href, "https://api.openai.com/v1/responses");
  const payload = JSON.parse(
    String(
      init?.body ?? (request instanceof Request ? await request.text() : "{}"),
    ),
  );
  assert.equal(payload.model, "gpt-6.1-sol");
  assert.equal(payload.text.format.name, "travelrelay_assistant");
  process.send?.("qa-provider-started");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return Response.json({
    id: "resp_infrastructure_fixture",
    object: "response",
    status: "completed",
    model: "gpt-6.1-sol",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            annotations: [],
            text: JSON.stringify({
              answer:
                "Offline infrastructure fixture. Your saved itinerary is unchanged; estimates and venue availability remain unverified.",
              activityIds: [],
              uncertainties: ["Offline fixture, not a live AI response."],
              proposal: null,
            }),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
      output_tokens_details: { reasoning_tokens: 0 },
    },
  });
};
