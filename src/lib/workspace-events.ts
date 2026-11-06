export const itineraryUpdatedEvent = "travelrelay:itinerary-updated";
export type ItineraryUpdate = {
  tripId: string;
  source: "manual" | "agent" | "wallet" | "recovery";
};
export function notifyItineraryChanged(
  tripId: string,
  source: ItineraryUpdate["source"],
) {
  window.dispatchEvent(
    new CustomEvent<ItineraryUpdate>(itineraryUpdatedEvent, {
      detail: { tripId, source },
    }),
  );
}
