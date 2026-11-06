import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return Response.json(await (await getApp()).commerce.webhook(request));
  } catch (error) {
    return failure(error);
  }
}
