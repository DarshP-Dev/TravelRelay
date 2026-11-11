export const assistantSuggestions = {
  itinerary: {
    label: "Refine my itinerary",
    prompt: "What could we improve in my current itinerary?",
  },
  pace: {
    label: "Find a more relaxed schedule",
    prompt:
      "Which day would benefit most from a slower pace, and how could we make it more relaxed?",
  },
  budget: {
    label: "Review my trip budget",
    prompt:
      "How much of my planning budget is still available, and where could I spend less?",
  },
} as const;

export type AssistantSuggestion =
  (typeof assistantSuggestions)[keyof typeof assistantSuggestions];
