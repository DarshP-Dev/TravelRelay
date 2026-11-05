import { z } from "zod";
import { curatedTrips, getTemplate, interests } from "./curated-trips";

const date = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Enter a valid date.",
  );
export const intentSchema = z
  .object({
    templateId: z
      .string()
      .max(40)
      .refine((id) => !!getTemplate(id), "Choose a supported inspiration.")
      .optional(),
    travelersConfirmed: z.boolean().optional(),
    step: z.number().int().min(0).max(3),
    review: z.boolean(),
    mode: z.enum(["known", "discover"]),
    destination: z.string().trim().max(120),
    vibe: z.string().trim().max(1000),
    departure: z.string().trim().max(120),
    start: date,
    end: date,
    flexible: z.boolean(),
    month: z.string().regex(/^(|\d{4}-(0[1-9]|1[0-2]))$/),
    duration: z.number().int().min(0).max(60),
    travelers: z.number().int().min(1).max(20),
    pace: z.enum(["relaxed", "balanced", "packed"]),
    budget: z
      .string()
      .max(20)
      .regex(/^(|\d{1,10}(\.\d{0,2})?)$/),
    currency: z.enum(["CAD", "USD", "EUR", "GBP", "JPY", "AUD"]),
    scope: z.enum(["entire", "spending"]),
    style: z.enum(["budget-friendly", "balanced", "premium"]),
    selected: z
      .array(z.string().refine((value) => interests.includes(value)))
      .max(10),
    mustSee: z.string().trim().max(1000),
    avoids: z.string().trim().max(1000),
    dietary: z.string().trim().max(500),
    accessibility: z.string().trim().max(500),
  })
  .strict();
export type TripIntent = z.infer<typeof intentSchema>;
export const completeIntentSchema = intentSchema.superRefine((value, ctx) => {
  const issue = (path: keyof TripIntent, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (value.mode === "known" ? !value.destination : !value.vibe)
    issue("destination", "Enter a destination or describe your escape.");
  if (!value.departure) issue("departure", "Enter your departure city.");
  if (value.templateId && !value.travelersConfirmed)
    issue(
      "travelersConfirmed",
      "Confirm the traveler count for your personalized trip.",
    );
  if (value.flexible) {
    if (!value.month || value.duration < 1)
      issue(
        "month",
        "Choose an approximate month and a trip length of 1–60 days.",
      );
  } else {
    if (!value.start || !value.end || value.end < value.start)
      issue("end", "Choose valid start and end dates in order.");
    else if ((Date.parse(value.end) - Date.parse(value.start)) / 86400000 >= 60)
      issue("end", "Keep this trip to 60 days or fewer.");
  }
  if (!value.budget || Number(value.budget) <= 0 || Number(value.budget) > 1e9)
    issue("budget", "Enter a budget greater than zero, up to 1 billion.");
  if (value.currency === "JPY" && value.budget.includes("."))
    issue("budget", "Enter a whole-yen budget for JPY.");
});

export function initialIntent(templateId?: string): TripIntent {
  const template = getTemplate(templateId);
  return {
    ...(template ? { templateId: template.id, travelersConfirmed: false } : {}),
    step: 0,
    review: false,
    mode: "known",
    destination: template ? `${template.city}, ${template.country}` : "",
    vibe: "",
    departure: "",
    start: "",
    end: "",
    flexible: false,
    month: "",
    duration: template?.days ?? 7,
    travelers: 1,
    pace: "balanced",
    budget: "",
    currency: template ? "USD" : "CAD",
    scope: template ? "spending" : "entire",
    style: "balanced",
    selected: [...(template?.interests ?? [])],
    mustSee: "",
    avoids: "",
    dietary: "",
    accessibility: "",
  };
}

export function destinationPhoto(destination: string) {
  const input = destination
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const aliases: Record<string, string[]> = {
    tokyo: ["tokyo"],
    kyoto: ["kyoto"],
    paris: ["paris"],
    "cinque-terre": ["monterosso", "cinque terre"],
    santorini: ["fira", "santorini"],
    dolomites: ["dobbiaco", "dolomites"],
  };
  return curatedTrips.find((trip) =>
    aliases[trip.id]?.some(
      (alias) =>
        input === alias ||
        input.startsWith(alias + ",") ||
        input.startsWith(alias + " "),
    ),
  );
}

export function safeReturnPath(value?: unknown) {
  if (
    typeof value !== "string" ||
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/dashboard";
  const url = new URL(value, "https://travelrelay.invalid");
  if (
    url.origin !== "https://travelrelay.invalid" ||
    url.pathname === "/login" ||
    url.pathname === "/signup" ||
    url.pathname.startsWith("/api/")
  )
    return "/dashboard";
  return url.pathname + url.search;
}
