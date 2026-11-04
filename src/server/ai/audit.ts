export type ValidationStage =
  | "provider"
  | "schema"
  | "normalization"
  | "domain"
  | "quality"
  | "persistence";
export type ValidationChecks = Record<
  ValidationStage,
  "passed" | "failed" | "not-run"
>;
export const initialValidationChecks = (): ValidationChecks => ({
  provider: "not-run",
  schema: "not-run",
  normalization: "not-run",
  domain: "not-run",
  quality: "not-run",
  persistence: "not-run",
});
