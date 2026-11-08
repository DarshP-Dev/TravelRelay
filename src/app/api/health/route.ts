import { getApp } from "@/server/runtime";
import { readinessResponse } from "@/server/db/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  return readinessResponse(async () => {
    await (await getApp()).health();
  });
}
