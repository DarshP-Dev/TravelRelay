import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return (await getApp()).handle(request, "trips");
  } catch (error) {
    return failure(error);
  }
}
