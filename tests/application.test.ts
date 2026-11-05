import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import {
  initialIntent,
  safeReturnPath,
  completeIntentSchema,
} from "../src/lib/trip-intent";
import { account, session } from "../src/server/db/schema";

const origin = "http://localhost:3000";
const secret = randomBytes(32).toString("base64url");
const password = randomBytes(20).toString("base64url");
const root = path.resolve(".test-data");
let directory: string;
let connection: Awaited<ReturnType<typeof openDatabase>>;
let app: ReturnType<typeof createApplication>;
let alice: string;
let bob: string;
let aliceId: string;
function request(
  url: string,
  method = "GET",
  cookie = "",
  body?: unknown,
  source = origin,
) {
  return new Request(origin + url, {
    method,
    headers: {
      origin: source,
      "content-type": "application/json",
      cookie,
      "x-forwarded-for": "127.0.0.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup(name: string) {
  const response = await app.authHandler(
    request("/api/auth/sign-up/email", "POST", "", {
      name,
      email: `${name.toLowerCase()}@example.com`,
      password,
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const cookies = response.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (value) => /httponly/i.test(value) && /samesite=lax/i.test(value),
    ),
  );
  return {
    cookie: cookies.map((value) => value.split(";")[0]).join(";"),
    user: (await response.json()).user,
  };
}
before(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "integration-"));
  connection = await openDatabase({ directory });
  await connection.migrate();
  app = createApplication(connection.db, { secret, origin });
  const a = await signup("Alice");
  alice = a.cookie;
  aliceId = a.user.id;
  bob = (await signup("Bob")).cookie;
});
after(async () => {
  if (connection) await connection.close();
  if (directory && path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
});

test("signup stores a password hash and creates a real session", async () => {
  const [stored] = await connection.db
    .select()
    .from(account)
    .where(eq(account.userId, aliceId));
  assert.ok(stored.password);
  assert.notEqual(stored.password, password);
  assert.ok(!stored.password.includes(password));
  assert.equal(
    (await app.handle(request("/api/trips", "GET", alice), "trips")).status,
    200,
  );
});
test("anonymous, forged and expired sessions cannot access resources", async () => {
  for (const cookie of ["", "travelrelay.session_token=forged"]) {
    assert.equal(
      (await app.handle(request("/api/trips", "GET", cookie), "trips")).status,
      401,
    );
    assert.equal(
      (await app.handle(request("/api/drafts", "POST", cookie, {}), "drafts"))
        .status,
      401,
    );
  }
  const temporary = await signup("Expired");
  await connection.db
    .update(session)
    .set({ expiresAt: new Date(0) })
    .where(eq(session.userId, temporary.user.id));
  assert.equal(
    (await app.handle(request("/api/trips", "GET", temporary.cookie), "trips"))
      .status,
    401,
  );
});
test("invalid credentials fail and logout revokes the server session", async () => {
  const wrong = await app.authHandler(
    request("/api/auth/sign-in/email", "POST", "", {
      email: "alice@example.com",
      password: randomBytes(20).toString("hex"),
    }),
  );
  assert.equal(wrong.status, 401);
  const login = await app.authHandler(
    request("/api/auth/sign-in/email", "POST", "", {
      email: "alice@example.com",
      password,
    }),
  );
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join(";");
  assert.equal(
    (await app.authHandler(request("/api/auth/sign-out", "POST", cookie, {})))
      .status,
    200,
  );
  assert.equal(
    (await app.handle(request("/api/trips", "GET", cookie), "trips")).status,
    401,
  );
});
test("origin checks reject cross-site auth and resource mutations", async () => {
  assert.equal(
    (
      await app.authHandler(
        request(
          "/api/auth/sign-out",
          "POST",
          alice,
          {},
          "https://evil.example",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.handle(
        request("/api/drafts", "POST", alice, {}, "https://evil.example"),
        "drafts",
      )
    ).status,
    403,
  );
});
test("draft creation, autosave restoration, isolation and optimistic concurrency", async () => {
  const opened = await app.handle(
    request("/api/drafts", "POST", alice, {}),
    "drafts",
  );
  assert.equal(opened.status, 200);
  const record = await opened.json();
  const again = await (
    await app.handle(request("/api/drafts", "POST", alice, {}), "drafts")
  ).json();
  assert.equal(again.id, record.id);
  const data = {
    ...initialIntent(),
    destination: "Kyoto",
    step: 2 as const,
    budget: "2000",
    currency: "CAD" as const,
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      app.handle(
        request(`/api/drafts/${record.id}`, "PUT", alice, {
          version: record.version,
          data,
        }),
        "drafts",
        record.id,
      ),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const restored = await (
    await app.handle(
      request(`/api/drafts/${record.id}`, "GET", alice),
      "drafts",
      record.id,
    )
  ).json();
  assert.equal(restored.version, record.version + 1);
  assert.deepEqual(restored.data, data);
  assert.equal(
    (
      await app.handle(
        request(`/api/drafts/${record.id}`, "GET", bob),
        "drafts",
        record.id,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await app.handle(
        request(`/api/drafts/${record.id}`, "PUT", bob, {
          version: restored.version,
          data,
        }),
        "drafts",
        record.id,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await app.handle(
        request(`/api/drafts/${record.id}`, "POST", bob, {
          version: restored.version,
          data,
        }),
        "drafts",
        record.id,
        true,
      )
    ).status,
    400,
  );
  assert.deepEqual(
    await (
      await app.handle(request("/api/drafts", "GET", bob), "drafts")
    ).json(),
    [],
  );
});
test("backend rejects unknown fields, malformed dates, invalid amounts and oversized bodies", async () => {
  const record = await (
    await app.handle(
      request("/api/drafts", "POST", alice, { templateId: "tokyo" }),
      "drafts",
    )
  ).json();
  for (const data of [
    { ...initialIntent(), travelers: 0 },
    { ...initialIntent(), start: "2027-02-30" },
    { ...initialIntent(), currency: "BAD" },
    { ...initialIntent(), ownerId: aliceId },
  ]) {
    assert.equal(
      (
        await app.handle(
          request("/api/drafts/x", "PUT", alice, {
            version: record.version,
            data,
          }),
          "drafts",
          record.id,
        )
      ).status,
      400,
    );
  }
  const large = await app.handle(
    request("/api/drafts", "POST", alice, { templateId: "x".repeat(21000) }),
    "drafts",
  );
  assert.equal(large.status, 413);
  assert.equal(
    completeIntentSchema.safeParse({ ...initialIntent(), budget: "-1" })
      .success,
    false,
  );
});
test("saving intent is atomic and idempotent, and trips remain private", async () => {
  const record = await (
    await app.handle(
      request("/api/drafts", "POST", alice, { templateId: "kyoto" }),
      "drafts",
    )
  ).json();
  const data = {
    ...initialIntent("kyoto"),
    budget: "1200",
    travelersConfirmed: true,
    departure: "Toronto",
    start: "2027-04-10",
    end: "2027-04-14",
    review: true,
    step: 3,
  };
  assert.equal(
    (
      await app.handle(
        request("/api/drafts/x", "POST", bob, {
          version: record.version,
          data,
        }),
        "drafts",
        record.id,
        true,
      )
    ).status,
    404,
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      app.handle(
        request("/api/drafts/x", "POST", alice, {
          version: record.version,
          data,
        }),
        "drafts",
        record.id,
        true,
      ),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.status),
    [200, 200],
  );
  const [a, b] = await Promise.all(results.map((result) => result.json()));
  assert.equal(a.id, b.id);
  assert.equal(
    (await app.handle(request("/api/trips/x", "GET", bob), "trips", a.id))
      .status,
    404,
  );
  assert.equal(
    (
      await app.handle(
        request("/api/drafts/x", "PUT", alice, {
          version: record.version,
          data,
        }),
        "drafts",
        record.id,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await (
        await app.handle(request("/api/trips", "GET", alice), "trips")
      ).json()
    ).length,
    1,
  );
  assert.deepEqual(
    await (await app.handle(request("/api/trips", "GET", bob), "trips")).json(),
    [],
  );
});
test("users, sessions, drafts and saved trips survive closing and reopening the database", async () => {
  await connection.close();
  connection = await openDatabase({ directory });
  app = createApplication(connection.db, { secret, origin });
  const response = await app.handle(
    request("/api/trips", "GET", alice),
    "trips",
  );
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].data.destination, "Kyoto, Japan");
  const drafts = await (
    await app.handle(request("/api/drafts", "GET", alice), "drafts")
  ).json();
  assert.ok(
    drafts.some(
      (d: { data: { destination: string } }) => d.data.destination === "Kyoto",
    ),
  );
});
test("auth rate limiting is enabled and return URLs stay on-site", async () => {
  let status = 0;
  for (let n = 0; n < 7; n++)
    status = (
      await app.authHandler(
        request("/api/auth/sign-in/email", "POST", "", {
          email: "unknown@example.com",
          password,
        }),
      )
    ).status;
  assert.equal(status, 429);
  for (const input of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/api/auth/sign-out",
  ])
    assert.equal(safeReturnPath(input), "/dashboard");
  assert.equal(
    safeReturnPath("/trips/new?template=tokyo"),
    "/trips/new?template=tokyo",
  );
});
