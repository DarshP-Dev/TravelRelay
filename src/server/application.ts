import { z } from "zod";
import { createAuth } from "./auth";
import { createTripStore, RequestError } from "./trips";
import type { Database } from "./db/connection";
import { createGenerationStore } from "./generation";
import { createTripModel, type TripModel } from "./model";
import type { GenerationLimits } from "./generation-quota";
import { createItineraryEditor } from "./itinerary-edits";
import { createTravelAgent } from "./agent";
import { createWallet, type FinancialVerifier } from "./wallet";

export function checkOrigin(request: Request, origin: string) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== new URL(origin).origin
  )
    throw new RequestError(403, "This request must come from TravelRelay.");
}
async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestError(415, "Send JSON data.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20000) {
      await reader.cancel();
      throw new RequestError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Enter valid JSON data.");
  }
}
export function failure(error: unknown) {
  const status =
    error instanceof RequestError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 503;
  const message =
    error instanceof RequestError
      ? error.message
      : error instanceof z.ZodError
        ? error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" ")
        : "Storage is temporarily unavailable. Please try again.";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function createApplication(
  db: Database,
  config: {
    secret: string;
    origin: string;
    model?: TripModel;
    generationLimits?: GenerationLimits;
    fxFetch?: typeof fetch;
    financialVerifier?: FinancialVerifier;
  },
) {
  const auth = createAuth(db, config);
  const trips = createTripStore(db);
  const itineraryEditor = createItineraryEditor(db);
  const model = config.model ?? createTripModel({});
  const travelAgent = createTravelAgent(db, model, config.generationLimits);
  const generations = createGenerationStore(db, model, config.generationLimits);
  const wallet = createWallet(db, {
    fxFetch: config.fxFetch,
    verifier: config.financialVerifier,
  });
  return {
    auth,
    trips,
    itineraryEditor,
    travelAgent,
    wallet,
    async walletHandler(request: Request, id: string) {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          throw new RequestError(401, "Sign in to view your TripWallet.");
        checkOrigin(request, config.origin);
        const data =
          request.method === "GET"
            ? await wallet.read(session.user.id, id)
            : request.method === "POST"
              ? await wallet.action(
                  session.user.id,
                  id,
                  await readJson(request),
                )
              : (() => {
                  throw new RequestError(405, "Method not allowed.");
                })();
        return Response.json(data, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
    async agentHandler(
      request: Request,
      id: string,
      schedule: (work: () => Promise<void>) => void,
    ) {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          throw new RequestError(401, "Sign in to use your trip assistant.");
        checkOrigin(request, config.origin);
        let data;
        let status = 200;
        if (request.method === "GET") {
          const before = new URL(request.url).searchParams.get("before");
          data = await travelAgent.read(
            session.user.id,
            id,
            before === null
              ? undefined
              : z.coerce.number().int().min(1).parse(before),
          );
        } else if (request.method === "POST") {
          const result = await travelAgent.action(
            session.user.id,
            id,
            await readJson(request),
          );
          if (result.queuedTurnId) {
            schedule(() =>
              travelAgent.run(session.user.id, id, result.queuedTurnId!),
            );
            status = 202;
          }
          data = { ...result.state, itineraryChanged: result.itineraryChanged };
        } else throw new RequestError(405, "Method not allowed.");
        return Response.json(data, {
          status,
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
    async itineraryHandler(request: Request, id: string, preview = false) {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          throw new RequestError(401, "Sign in to edit your itinerary.");
        checkOrigin(request, config.origin);
        const data =
          request.method === "GET" && !preview
            ? await itineraryEditor.read(session.user.id, id)
            : request.method === "POST"
              ? await (
                  preview ? itineraryEditor.preview : itineraryEditor.commit
                )(session.user.id, id, await readJson(request))
              : (() => {
                  throw new RequestError(405, "Method not allowed.");
                })();
        return Response.json(data, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
    generations,
    async generationHandler(
      request: Request,
      id: string,
      schedule: (work: () => Promise<void>) => void,
    ) {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          throw new RequestError(401, "Please sign in to generate your trip.");
        checkOrigin(request, config.origin);
        let data;
        if (request.method === "GET")
          data = await generations.read(session.user.id, id);
        else if (request.method === "POST") {
          data = await generations.action(
            session.user.id,
            id,
            await readJson(request),
          );
          if (data.status === "queued")
            schedule(() => generations.run(session.user.id, id));
        } else throw new RequestError(405, "Method not allowed.");
        return Response.json(data, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
    async authHandler(request: Request) {
      try {
        checkOrigin(request, config.origin);
        if (request.method === "POST" && request.body) {
          const body = await readJson(request);
          const headers = new Headers(request.headers);
          headers.delete("content-length");
          request = new Request(request.url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
        }
        return await auth.handler(request);
      } catch (error) {
        return failure(error);
      }
    },
    async handle(
      request: Request,
      resource: "trips" | "drafts",
      id?: string,
      complete = false,
    ) {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          throw new RequestError(401, "Please sign in to access your trips.");
        checkOrigin(request, config.origin);
        const userId = session.user.id;
        let data: unknown;
        if (resource === "trips" && request.method === "GET")
          data = id ? await trips.read(userId, id) : await trips.list(userId);
        else if (resource === "drafts" && request.method === "GET")
          data = id
            ? await trips.readDraft(userId, id)
            : await trips.listDrafts(userId);
        else if (resource === "drafts" && request.method === "POST" && !id)
          data = await trips.openDraft(userId, await readJson(request));
        else if (
          resource === "drafts" &&
          id &&
          request.method === "PUT" &&
          !complete
        )
          data = await trips.saveDraft(userId, id, await readJson(request));
        else if (
          resource === "drafts" &&
          id &&
          request.method === "POST" &&
          complete
        )
          data = await trips.complete(userId, id, await readJson(request));
        else throw new RequestError(405, "Method not allowed.");
        return Response.json(data, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
