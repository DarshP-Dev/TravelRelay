import type { ModelItinerary } from "./itinerary";

export type Activity = ModelItinerary["days"][number]["activities"][number];
export function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export const activityText = (activity: Pick<Activity, "title" | "location">) =>
  normalized(`${activity.title} ${activity.location}`);
export const foodCue =
  /\b(cafe|coffee|bakery|patisserie|pastry|croissant|bistro|brasserie|restaurant|trattoria|pizzeria|izakaya|kaiseki|ramen|sushi|tapas|dim sum|food market|street food|food tour|culinary|cooking|tasting|brunch|lunch|dinner|supper|breakfast|tea|teahouse|tea house)\b/;
export function expenseCategory(
  activity: Pick<Activity, "title" | "location">,
): "food" | "localTransport" | "activities" {
  if (foodCue.test(activityText(activity))) return "food";
  if (
    /\b(taxi|metro|subway|bus fare|tram|local transport|airport transfer)\b/.test(
      activityText(activity),
    )
  )
    return "localTransport";
  return "activities";
}
export function substantialMeal(activity: Activity) {
  const title = normalized(activity.title);
  // A snack or tasting is not a meal merely because it occurs at lunchtime.
  if (/\b(coffee|pastry|croissant|bakery|patisserie|tea|tasting)\b/.test(title))
    return false;
  return /\b(lunch|dinner|supper|brunch|restaurant|bistro|brasserie|trattoria|pizzeria|izakaya|kaiseki|ramen|sushi)\b/.test(
    title,
  );
}
