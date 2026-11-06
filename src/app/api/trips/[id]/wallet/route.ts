import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export const maxDuration = 30;
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).walletHandler(request, (await context.params).id);
  } catch (error) {
    return failure(error);
  }
}
export { handle as GET, handle as POST };
