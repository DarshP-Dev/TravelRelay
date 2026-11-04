import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getApp } from "./runtime";
import { safeReturnPath } from "../lib/trip-intent";

export const currentUser = cache(async () => {
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) return null;
  const app = await getApp();
  return (
    (await app.auth.api.getSession({ headers: requestHeaders }))?.user ?? null
  );
});
export async function requireUser(returnTo = "/dashboard") {
  const user = await currentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return user;
}
