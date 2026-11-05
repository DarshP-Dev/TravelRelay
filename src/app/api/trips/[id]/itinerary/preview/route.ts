import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).itineraryHandler(
      request,
      (await context.params).id,
      true,
    );
  } catch (error) {
    return failure(error);
  }
}
