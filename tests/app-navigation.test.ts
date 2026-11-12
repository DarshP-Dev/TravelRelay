import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appNavigation,
  isActiveAppRoute,
  isAppRoute,
} from "../src/lib/app-navigation";

test("the workspace shell covers product routes and keeps public landing and auth focused", () => {
  for (const route of [
    "/dashboard",
    "/profile",
    "/trips",
    "/trips/new",
    "/explore",
    "/explore/kyoto",
    ...["", "/itinerary", "/wallet", "/bookings", "/recovery", "/generate"].map(
      (section) => "/trips/trip-id" + section,
    ),
  ])
    assert.equal(isAppRoute(route), true, route);

  for (const route of [
    "/",
    "/login",
    "/signup",
    "/example-trip",
    "/credits",
    "/api/trips",
  ])
    assert.equal(isAppRoute(route), false, route);
});

test("trip tabs, curated previews and the wizard select exactly one global shortcut", () => {
  for (const [path, expected] of [
    ["/trips/trip-id/wallet", "/trips"],
    ["/trips/trip-id/explore", "/trips"],
    ["/trips/new", "/trips/new"],
    ["/explore/paris", "/explore"],
    ["/dashboard", "/dashboard"],
  ])
    assert.deepEqual(
      appNavigation
        .filter(({ href }) => isActiveAppRoute(path, href))
        .map(({ href }) => href),
      [expected],
    );
});
