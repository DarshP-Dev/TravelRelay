import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).handle(request, "trips", (await params).id);
  } catch (error) {
    return failure(error);
  }
}
