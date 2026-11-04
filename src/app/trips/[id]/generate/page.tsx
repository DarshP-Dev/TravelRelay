import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import { RequestError } from "@/server/trips";
import { TripGeneration } from "@/components/trip-generation";
export const metadata = { title: "Create your itinerary" };
export default async function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/generate`);
  const saved = await (async () => {
    try {
      return await (await getApp()).trips.read(user.id, id);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) notFound();
      throw error;
    }
  })();
  return <TripGeneration key={id} id={id} intent={saved.data} />;
}
