// Authored offline suggestions for the isolated recovery QA. No live results.
export function recoveryFixture(context) {
  const { affected } = context.recovery;
  const activity = affected.activity;
  const base = {
    type: "add_activity",
    activityId: null,
    dayId: affected.dayId,
    title: "Quiet neighborhood culture walk",
    description:
      "Take a short self-guided walk and look at the neighborhood architecture. Check public access locally.",
    category: "culture",
    location: "Saint-Germain-des-Prés, Paris",
    city: context.trip.base.city,
    startMinute: activity.startMinute + 10,
    durationMinutes: activity.durationMinutes - 20,
    bufferBeforeMinutes: 30,
    costMinor: activity.costMinor,
    currency: context.trip.budget.currency,
  };
  return {
    alternatives: [
      {
        kind: "similar",
        rationale:
          "An offline fixture for a comparable culture stop in the same afternoon slot.",
        action: base,
      },
      {
        kind: "free",
        rationale:
          "A self-guided walk keeps a culture focus and leaves time for a break.",
        action: {
          ...base,
          costMinor: 0,
          title: "Free Saint-Germain architecture walk",
        },
      },
    ],
  };
}
