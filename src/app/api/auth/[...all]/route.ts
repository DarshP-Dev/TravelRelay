import { getApp } from "@/server/runtime";
import { failure } from "@/server/application";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    return (await getApp()).authHandler(request);
  } catch (error) {
    return failure(error);
  }
}
export { handle as GET, handle as POST };
