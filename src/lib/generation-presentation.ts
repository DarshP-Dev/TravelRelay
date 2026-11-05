export type GenerationSnapshot = {
  status: string;
  confirmed: boolean;
  attempts: number;
};
export const generationStages = [
  {
    key: "choosing",
    label: "Find your base city",
    description: "Matching your destination, budget and preferences.",
  },
  {
    key: "awaiting_confirmation",
    label: "Make it yours",
    description: "Review and confirm one city and your dates.",
  },
  {
    key: "generating",
    label: "Shape the days ahead",
    description: "Building a personalized plan with room to breathe.",
  },
  {
    key: "validating",
    label: "Bring it all together",
    description: "Checking timing, budget and saving your complete itinerary.",
  },
] as const;
export function generationPresentation(job: GenerationSnapshot | null) {
  const pending =
    !!job &&
    ["queued", "choosing", "generating", "validating"].includes(job.status);
  const stageIndex = !job
    ? -1
    : job.status === "complete"
      ? 4
      : ["queued", "failed"].includes(job.status)
        ? job.confirmed
          ? 2
          : 0
        : generationStages.findIndex((stage) => stage.key === job.status);
  const messages: Record<string, string> = {
    queued: "Your saved request is queued for planning.",
    choosing: "The AI is proposing one base city and dates for your review.",
    awaiting_confirmation:
      "Your destination proposal is ready. Confirm it before itinerary generation.",
    generating:
      "The AI is arranging your complete itinerary. Individual days stay hidden.",
    validating:
      "The server is checking the whole itinerary and saving it only if every check passes.",
    complete: "Your complete itinerary passed validation and is saved.",
    failed:
      "Planning needs attention. Your saved input and any confirmed base city remain available.",
  };
  return {
    pending,
    stageIndex,
    canRetry: job?.status === "failed" && job.attempts < 3,
    message: job
      ? (messages[job.status] ?? "Check your saved planning status.")
      : "Your input is saved. Start when you are ready.",
  };
}
