import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).commerceHandler(request, (await params).id);
  } catch (error) {
    return failure(error);
  }
}
export { handle as GET, handle as POST };
