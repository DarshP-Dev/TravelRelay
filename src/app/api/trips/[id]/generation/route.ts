import { after } from "next/server";
import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export const maxDuration = 240;
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).generationHandler(
      request,
      (await context.params).id,
      after,
    );
  } catch (error) {
    return failure(error);
  }
}
export { handle as GET, handle as POST };
