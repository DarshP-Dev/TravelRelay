import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return (await getApp()).handle(request, "drafts", (await params).id, true);
  } catch (error) {
    return failure(error);
  }
}
