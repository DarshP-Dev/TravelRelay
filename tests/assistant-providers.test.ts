import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripModel, type ModelUsage } from "../src/server/model";
import { agentReply, agentOpenAIWire } from "./helpers/agent-fixtures";

test("both official SDKs send bounded assistant schemas using the approved manual provider selection", async () => {
  for (const provider of ["openai", "gemini"] as const) {
    let calls = 0;
    const usages: ModelUsage[] = [];
    const model = createTripModel({
      provider,
      key: "offline-test-key",
      fetch: async (request, init) => {
        calls++;
        const url = request instanceof Request ? request.url : String(request);
        const payload = JSON.parse(
          String(
            init?.body ??
              (request instanceof Request ? await request.text() : "{}"),
          ),
        );
        assert.equal(
          new URL(url).hostname,
          provider === "openai"
            ? "api.openai.com"
            : "generativelanguage.googleapis.com",
        );
        if (provider === "openai") {
          assert.equal(payload.model, "gpt-6.1-sol");
          assert.equal(payload.reasoning.effort, "medium");
          assert.equal(payload.max_output_tokens, 8192);
          assert.equal(payload.text.format.type, "json_schema");
          assert.equal(payload.text.format.strict, true);
          assert.equal(payload.text.format.name, "travelrelay_assistant");
          assert.equal(payload.store, false);
          assert.equal(payload.background, false);
          assert.equal(payload.stream, false);
          assert.equal(payload.tools, undefined);
          assert.ok(payload.instructions.includes("separate user approval"));
        } else {
          assert.ok(url.includes("gemini-3.5-flash-lite"));
          assert.equal(payload.generationConfig.maxOutputTokens, 8192);
          assert.equal(
            payload.generationConfig.thinkingConfig.thinkingLevel,
            "MEDIUM",
          );
          assert.equal(
            payload.generationConfig.responseMimeType,
            "application/json",
          );
          assert.ok(
            payload.generationConfig.responseJsonSchema.properties.proposal,
          );
        }
        return Response.json(
          provider === "openai"
            ? agentOpenAIWire(agentReply())
            : {
                candidates: [
                  {
                    finishReason: "STOP",
                    content: {
                      role: "model",
                      parts: [{ text: JSON.stringify(agentReply()) }],
                    },
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 1200,
                  candidatesTokenCount: 500,
                  thoughtsTokenCount: 300,
                  totalTokenCount: 2000,
                },
              },
        );
      },
    });
    const result = await model.respond!(
      {
        request: "How much remains?",
        trip: {
          version: 0,
          budget: { remainingMinor: 22600, reserveMinor: 25000 },
        },
      },
      {
        onUsage: (u) => {
          usages.push(u);
        },
      },
    );
    assert.deepEqual(result, agentReply());
    assert.equal(calls, 1);
    assert.equal(usages[0].phase, "assistant");
    assert.equal(usages[0].outputTokens, 800);
    assert.equal(usages[0].reasoningTokens, 300);
    await assert.rejects(
      model.respond!({ request: "x".repeat(96001) }),
      /too long/,
    );
    assert.equal(calls, 1);
  }
});
test("assistant provider quota, timeouts, refusals and malformed replies never retry or switch models", async () => {
  for (const failure of ["429", "timeout", "invalid", "refusal"]) {
    let calls = 0;
    const usages: ModelUsage[] = [];
    const model = createTripModel({
      key: "offline-key",
      fetch: async () => {
        calls++;
        if (failure === "429")
          return Response.json(
            {
              error: {
                message: "private-provider-payload",
                type: "rate_limit_exceeded",
              },
            },
            { status: 429 },
          );
        if (failure === "timeout")
          throw new DOMException("private-provider-payload", "AbortError");
        if (failure === "invalid")
          return Response.json(agentOpenAIWire({ answer: "invalid" }));
        return Response.json({
          ...agentOpenAIWire(agentReply()),
          output: [
            {
              type: "message",
              id: "refused",
              role: "assistant",
              status: "completed",
              content: [
                { type: "refusal", refusal: "private-provider-payload" },
              ],
            },
          ],
        });
      },
    });
    await assert.rejects(
      model.respond!(
        { request: "Question" },
        {
          onUsage: (u) => {
            usages.push(u);
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("private-provider-payload"));
        return true;
      },
    );
    assert.equal(calls, 1);
    assert.equal(
      usages.length,
      ["invalid", "refusal"].includes(failure) ? 1 : 0,
    );
  }
});
