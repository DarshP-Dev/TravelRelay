import { readFileSync } from "node:fs";
import type { TripIntent } from "../../src/lib/trip-intent";
import type { CityProposal, ModelItinerary } from "../../src/lib/itinerary";
import type { ModelUsage } from "../../src/server/model";
import type { ValidationChecks } from "../../src/server/ai/audit";
import type { ItineraryNormalization } from "../../src/lib/itinerary-normalization";
export const solRecording = JSON.parse(
  readFileSync(
    new URL("../fixtures/paris-sol-recorded.json", import.meta.url),
    "utf8",
  ),
) as {
  provenance: {
    recordedAt: string;
    rawPlanSha256: string;
    usage: ModelUsage;
    originalQualityIssues: { code: string; message: string }[];
    originalAudit: {
      provider: string;
      model: string;
      phase: string;
      attempt: number;
      status: string;
      usage: ModelUsage;
      validation: ValidationChecks;
      normalization: ItineraryNormalization;
      error: string;
      createdAt: string;
      updatedAt: string;
    };
  };
  intent: TripIntent;
  base: CityProposal;
  plan: ModelItinerary;
};
