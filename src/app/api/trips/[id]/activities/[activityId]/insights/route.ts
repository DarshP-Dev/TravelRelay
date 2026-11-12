import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; activityId: string }> },
) {
  try {
    const { id, activityId } = await context.params;
    return (await getApp()).activityInsightsHandler(request, id, activityId);
  } catch (error) {
    return failure(error);
  }
}
