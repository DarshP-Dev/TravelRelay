import { z } from "zod";

export const activityCategories = [
  "culture",
  "food",
  "transport",
  "outdoors",
  "shopping",
  "entertainment",
  "relaxation",
  "other",
] as const;
export const safeReferenceSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        try {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            !!u.hostname.includes(".") &&
            !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(
              u.hostname,
            ) &&
            !u.hostname.endsWith(".local")
          );
        } catch {
          return false;
        }
      }, "Use a public HTTPS reference without credentials."),
  })
  .strict();
export type ActivityReference = z.infer<typeof safeReferenceSchema>;
export type ActivityCategory = (typeof activityCategories)[number];
export type ActivityMetadata = {
  category?: ActivityCategory;
  links?: ActivityReference[];
  origin?: "ai" | "manual";
  estimateSource?: "ai-estimate" | "manual-estimate";
  coordinateSource?: "ai-estimate" | "user-entered" | "missing";
};
export function referenceSource(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com"))
    return "Instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
  if (["youtube.com", "youtu.be"].includes(host)) return "YouTube";
  return host;
}
export function parseEstimatedCost(value: string, currency: string) {
  if (
    !/^\d{1,10}(\.\d{1,2})?$/.test(value) ||
    (currency === "JPY" && value.includes("."))
  )
    throw Error(
      "Enter a nonnegative amount in the trip currency; JPY uses whole yen.",
    );
  const [whole, decimals = ""] = value.split(".");
  return (
    Number(whole) * (currency === "JPY" ? 1 : 100) +
    (currency === "JPY" ? 0 : Number(decimals.padEnd(2, "0")))
  );
}
export function clock(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}
