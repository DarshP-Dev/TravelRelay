import type { TripIntent } from "./trip-intent";
import {
  dateAfter,
  distanceKm,
  PlanningError,
  tripDays,
  type CityProposal,
  type ModelItinerary,
} from "./itinerary";
import {
  activityText as textOf,
  foodCue as food,
  normalized,
  substantialMeal,
} from "./activity-semantics";
import {
  classifyVenue,
  type ActivityCategoryHint,
  type VenueCategory,
  type VenueClassification,
} from "./venue-classification";
export { normalized } from "./activity-semantics";

type Activity = ModelItinerary["days"][number]["activities"][number];
export type DayRole = "arrival" | "full" | "departure" | "single-day";
export type DayPolicy = {
  date: string;
  role: DayRole;
  startMinute: number;
  endMinute: number;
  minActivities: number;
  maxActivities: number;
  maxPlannedMinutes: number;
};
export type VenueReference = {
  id: string;
  name: string;
  city: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  sourceUrl: string;
  checkedOn: string;
  scope: "published-hours";
  category?: VenueCategory;
  attractionType?: VenueClassification["attractionType"];
  closedDates: string[];
  weekly: Record<
    number,
    { open: number; close: number; lastAdmission: number } | null
  >;
};
export type VenueCheck = {
  dayIndex: number;
  activityIndex: number;
  name: string;
  sourceUrl: string;
  checkedOn: string;
  scope: "published-hours";
  publishedWindow?: {
    openMinute: number;
    lastAdmissionMinute: number;
    endMinute: number;
  };
};
export type ItineraryQuality = {
  version: 1 | 2 | 3;
  days: DayPolicy[];
  assumptions: string[];
  interestCoverage: {
    interest: string;
    matches: { dayIndex: number; activityIndex: number }[];
  }[];
  venueChecks: VenueCheck[];
  classifications?: ({
    dayIndex: number;
    activityIndex: number;
  } & VenueClassification)[];
};
export type QualityIssue = {
  code: string;
  message: string;
  dayIndex?: number;
  activityIndex?: number;
};
const logistics =
  /\b(check in|check out|airport|transfer|baggage|luggage|hotel breakfast|flight|train departure)\b/;
const rest =
  /\b(free time|rest break|lunch break|dinner break|own arrangements|at leisure)\b/;
const interestCues: Record<string, RegExp> = {
  Food: food,
  Culture:
    /\b(museum|musee|temple|shrine|palace|historic|heritage|cultural|cathedral|basilica|tour|castle|quarter|district)\b/,
  Outdoors:
    /\b(park|garden|walk|hike|hiking|trail|beach|lake|nature|coast|river|promenade)\b/,
  Adventure:
    /\b(hike|hiking|kayak|kayaking|climb|climbing|cycling|bike|biking|surf|surfing|rafting|snorkel|snorkeling|adventure)\b/,
  Shopping: /\b(shop|shopping|boutique|market|bazaar|mall|department store)\b/,
  Nightlife: /\b(bar|pub|club|nightlife|live music|lounge)\b/,
  Art: /\b(museum|musee|gallery|art|exhibition|sculpture|atelier)\b/,
  Relaxation: /\b(spa|garden|park|beach|picnic|tea|relax|onsen|cafe|coffee)\b/,
  "Hidden gems":
    /\b(neighborhood|neighbourhood|laneway|local market|independent|hidden|backstreet)\b/,
  Entertainment:
    /\b(theater|theatre|cinema|concert|show|performance|music|comedy|festival|amusement)\b/,
};
export function meaningfulActivity(activity: Activity) {
  return !logistics.test(textOf(activity)) && !rest.test(textOf(activity));
}
export function dayWindows(intent: TripIntent): Omit<DayPolicy, "date">[] {
  const count = tripDays(intent),
    pace = intent.pace;
  return Array.from({ length: count }, (_, index) => {
    if (count === 1)
      return {
        role: "single-day",
        startMinute: 600,
        endMinute: intent.selected.includes("Nightlife") ? 1260 : 1020,
        minActivities: { relaxed: 2, balanced: 3, packed: 4 }[pace],
        maxActivities: { relaxed: 3, balanced: 4, packed: 5 }[pace],
        maxPlannedMinutes: { relaxed: 240, balanced: 300, packed: 360 }[pace],
      };
    if (index === 0)
      return {
        role: "arrival",
        startMinute: 840,
        endMinute: 1260,
        minActivities: pace === "relaxed" ? 1 : 2,
        maxActivities: pace === "relaxed" ? 2 : 3,
        maxPlannedMinutes: { relaxed: 180, balanced: 240, packed: 300 }[pace],
      };
    if (index === count - 1)
      return {
        role: "departure",
        startMinute: 540,
        endMinute: 720,
        minActivities: 1,
        maxActivities: 2,
        maxPlannedMinutes: 120,
      };
    return {
      role: "full",
      startMinute: 540,
      endMinute: intent.selected.includes("Nightlife") ? 1380 : 1320,
      minActivities: { relaxed: 2, balanced: 3, packed: 5 }[pace],
      maxActivities: { relaxed: 3, balanced: 5, packed: 7 }[pace],
      maxPlannedMinutes: { relaxed: 360, balanced: 480, packed: 600 }[pace],
    };
  });
}
export function dayPolicies(
  intent: TripIntent,
  base: CityProposal,
): DayPolicy[] {
  return dayWindows(intent).map((window, index) => ({
    date: dateAfter(base.startDate, index),
    ...window,
  }));
}

export function travelDayAssumption(intent: TripIntent) {
  if (tripDays(intent) === 1)
    return intent.selected.includes("Nightlife")
      ? "Single-day evening plan assumes same-day travel can fit outside the 10:00–21:00 activity window. Confirm that the actual return is possible on the selected date."
      : "Single-day local plan assumes same-day travel outside the 10:00–17:00 activity window. Confirm that the actual travel fits on the selected date.";
  return "Arrival and departure times were not supplied: arrival activities start from 14:00 and departure activities end by 12:00. Check these assumptions against your own travel arrangements.";
}
export function estimatedTravelBuffer(
  previous: Activity,
  current: Activity,
  intent: TripIntent,
) {
  const km = distanceKm(previous, current);
  const minutes =
    km <= 2
      ? Math.max(15, Math.ceil((km / 4.5) * 60) + 10)
      : Math.max(30, Math.ceil((km / 20) * 60) + 20);
  return minutes + (intent.accessibility ? 10 : 0);
}
function durationRange(
  activity: Activity,
  classification: VenueClassification,
): [number, number] {
  const text = textOf(activity);
  if (
    classification.category === "indoor-attraction" &&
    ["museum", "palace"].includes(classification.attractionType ?? "")
  )
    return [90, 240];
  if (
    /\b(hike|hiking|kayak|kayaking|climb|climbing|cycling|biking)\b/.test(text)
  )
    return [60, 360];
  if (food.test(text))
    return [/\b(coffee|cafe|tea|bakery)\b/.test(text) ? 30 : 45, 120];
  if (/\b(walk|walking|promenade|garden|park)\b/.test(text)) return [45, 180];
  return [30, 240];
}
function hasMealSpace(activities: Activity[], kind: "lunch" | "dinner") {
  const [windowStart, windowEnd] = kind === "lunch" ? [690, 870] : [1080, 1260];
  if (
    activities.some(
      (a) =>
        substantialMeal(a) &&
        !(
          kind === "lunch"
            ? /\b(dinner|supper|breakfast)\b/
            : /\b(lunch|brunch|breakfast)\b/
        ).test(normalized(a.title)) &&
        meaningfulActivity(a) &&
        a.durationMinutes >= 45 &&
        a.startMinute >= windowStart &&
        a.startMinute <= windowEnd,
    )
  )
    return true;
  let availableFrom = windowStart;
  const occupied = activities
    .flatMap((activity) => [
      [
        activity.startMinute - activity.bufferBeforeMinutes,
        activity.startMinute,
      ],
      ...(!rest.test(textOf(activity))
        ? [
            [
              activity.startMinute,
              activity.startMinute + activity.durationMinutes,
            ],
          ]
        : []),
    ])
    .sort((a, b) => a[0] - b[0]);
  for (const [occupiedFrom, occupiedTo] of occupied) {
    if (occupiedTo <= windowStart) continue;
    if (Math.min(occupiedFrom, windowEnd) - availableFrom >= 60) return true;
    availableFrom = Math.max(availableFrom, occupiedTo);
  }
  return windowEnd - availableFrom >= 60;
}
export function assessItineraryQuality(
  plan: ModelItinerary,
  intent: TripIntent,
  base: CityProposal,
  references: VenueReference[] = [],
  categories: ActivityCategoryHint[] = [],
) {
  const policies = dayPolicies(intent, base),
    issues: QualityIssue[] = [],
    venueChecks: VenueCheck[] = [];
  const classified = plan.days.map((day, dayIndex) =>
    day.activities.map((activity, activityIndex) =>
      classifyVenue(
        activity,
        base,
        references,
        categories.find(
          (hint) =>
            hint.dayIndex === dayIndex && hint.activityIndex === activityIndex,
        )?.category,
      ),
    ),
  );
  const add = (
    code: string,
    message: string,
    dayIndex?: number,
    activityIndex?: number,
  ) => issues.push({ code, message, dayIndex, activityIndex });
  const seenVenues = new Set<string>();
  plan.days.forEach((day, dayIndex) => {
    const policy = policies[dayIndex];
    if (!policy) return;
    const meaningful = day.activities.filter(meaningfulActivity);
    if (
      meaningful.length < policy.minActivities ||
      meaningful.length > policy.maxActivities
    )
      add(
        "pace-detail",
        `Day ${dayIndex + 1} (${policy.role}) needs ${policy.minActivities}–${policy.maxActivities} meaningful activities for your ${intent.pace} pace.`,
        dayIndex,
      );
    const plannedMinutes = day.activities.reduce(
      (sum, a) => sum + a.durationMinutes,
      0,
    );
    if (plannedMinutes > policy.maxPlannedMinutes)
      add(
        "day-load",
        `Day ${dayIndex + 1} leaves too little breathing room for this travel day and pace.`,
        dayIndex,
      );
    if (
      (policy.role === "full" || policy.role === "single-day") &&
      !hasMealSpace(day.activities, "lunch")
    )
      add(
        "meal-space",
        `Day ${dayIndex + 1} needs a substantial lunch or a full hour free between 11:30 and 14:30, separate from travel. A pastry tasting or coffee stop is not a complete lunch.`,
        dayIndex,
      );
    if (
      (policy.role === "full" ||
        policy.role === "arrival" ||
        (policy.role === "single-day" && policy.endMinute > 1080)) &&
      !hasMealSpace(day.activities, "dinner")
    )
      add(
        "dinner-space",
        `Day ${dayIndex + 1} needs a substantial dinner or a full hour free between 18:00 and 21:00, separate from travel.`,
        dayIndex,
      );
    day.activities.forEach((activity, activityIndex) => {
      const text = textOf(activity),
        end = activity.startMinute + activity.durationMinutes;
      const { classification, reference } = classified[dayIndex][activityIndex];
      if (classification.ambiguous)
        add(
          "ambiguous-venue",
          `${activity.title} mixes or contradicts venue types; clarify the activity before scheduling it. No opening hours are assumed verified.`,
          dayIndex,
          activityIndex,
        );
      const title = normalized(activity.title);
      if (
        (/\b(lunch)\b/.test(title) &&
          (activity.startMinute < 690 || activity.startMinute > 870)) ||
        (/\b(dinner|supper)\b/.test(title) &&
          (activity.startMinute < 1080 || activity.startMinute > 1260))
      )
        add(
          "meal-time",
          `${activity.title} is outside its realistic meal-start window (lunch 11:30–14:30, dinner 18:00–21:00); service hours still need confirmation.`,
          dayIndex,
          activityIndex,
        );
      if (activity.startMinute < policy.startMinute || end > policy.endMinute)
        add(
          "travel-day-window",
          `Day ${dayIndex + 1} must stay within its ${policy.role} planning window; actual travel times are not known.`,
          dayIndex,
          activityIndex,
        );
      if (
        activityIndex === 0 &&
        policy.role === "arrival" &&
        activity.bufferBeforeMinutes < 30
      )
        add(
          "arrival-buffer",
          `Day ${dayIndex + 1} needs at least 30 minutes of arrival/settling buffer.`,
          dayIndex,
          activityIndex,
        );
      if (meaningfulActivity(activity)) {
        const city = normalized(base.city);
        const location = normalized(activity.location)
          .replace(new RegExp(`(?:^| )${city}(?: |$)`, "g"), " ")
          .trim();
        if (
          !location ||
          /^(central|downtown|city|your hotel|hotel|restaurant|cafe|city center|city centre|tbd|anywhere|local restaurant)$/.test(
            location,
          )
        )
          add(
            "activity-location",
            `${activity.title} needs a named venue or specific neighborhood, not a generic placeholder.`,
            dayIndex,
            activityIndex,
          );
        const [minimum, maximum] = durationRange(activity, classification);
        if (
          activity.durationMinutes < minimum ||
          activity.durationMinutes > maximum
        )
          add(
            "activity-duration",
            `${activity.title} needs a realistic ${minimum}–${maximum} minute allowance for this activity type.`,
            dayIndex,
            activityIndex,
          );
        if (activity.description.trim().length < 60)
          add(
            "activity-detail",
            `${activity.title} needs a concrete description of the experience and why it fits the traveler.`,
            dayIndex,
            activityIndex,
          );
      }
      const previous = day.activities[activityIndex - 1];
      if (previous) {
        const buffer = estimatedTravelBuffer(previous, activity, intent);
        if (
          activity.bufferBeforeMinutes < buffer ||
          activity.startMinute <
            previous.startMinute + previous.durationMinutes + buffer
        )
          add(
            "travel-buffer",
            `${activity.title} needs at least ${buffer} estimated travel/arrival minutes from the previous stop.`,
            dayIndex,
            activityIndex,
          );
      }
      if (reference) {
        const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        const hours = reference.weekly[weekday];
        const closed = reference.closedDates.includes(day.date.slice(5));
        if (
          !hours ||
          closed ||
          activity.startMinute < hours.open ||
          activity.startMinute > hours.lastAdmission ||
          end > hours.close
        )
          add(
            "published-hours",
            `${reference.name} conflicts with its published hours reference (checked ${reference.checkedOn}); revise the visit time or day.`,
            dayIndex,
            activityIndex,
          );
        venueChecks.push({
          dayIndex,
          activityIndex,
          name: reference.name,
          sourceUrl: reference.sourceUrl,
          checkedOn: reference.checkedOn,
          scope: "published-hours",
          ...(hours
            ? {
                publishedWindow: {
                  openMinute: hours.open,
                  lastAdmissionMinute: hours.lastAdmission,
                  endMinute: hours.close,
                },
              }
            : {}),
        });
      } else if (
        ["indoor-attraction", "shopping"].includes(classification.category) &&
        (activity.startMinute < 600 || end > 1020)
      )
        add(
          "unverified-venue-window",
          `${activity.title} has no source-checked hours; use a conservative 10:00–17:00 visitor window and mark hours unverified.`,
          dayIndex,
          activityIndex,
        );
      if (["indoor-attraction", "shopping"].includes(classification.category)) {
        const key = reference?.id ?? normalized(activity.location);
        if (seenVenues.has(key))
          add(
            "duplicate-venue",
            `${activity.location} is repeated; do not pad the itinerary with duplicate venue visits.`,
            dayIndex,
            activityIndex,
          );
        seenVenues.add(key);
      }
      if (
        /\b(nightclub|night club|clubbing)\b/.test(normalized(intent.avoids)) &&
        /\b(nightclub|night club|clubbing)\b/.test(text)
      )
        add(
          "avoided-activity",
          "The itinerary includes a nightclub despite the saved avoidance preference.",
          dayIndex,
          activityIndex,
        );
    });
  });
  const interestCoverage = intent.selected.map((interest) => ({
    interest,
    matches: plan.days.flatMap((day, dayIndex) =>
      day.activities.flatMap((activity, activityIndex) =>
        meaningfulActivity(activity) &&
        (interest !== "Nightlife" || activity.startMinute >= 1080) &&
        interestCues[interest]?.test(
          classified[dayIndex][activityIndex].interestText,
        )
          ? [{ dayIndex, activityIndex }]
          : [],
      ),
    ),
  }));
  for (const item of interestCoverage)
    if (!item.matches.length)
      add(
        "interest-coverage",
        `${item.interest} needs a concrete relevant activity; an expense allowance or introductory claim does not count.`,
      );
  const assumptions = [
    travelDayAssumption(intent),
    "Travel buffers are conservative distance-based estimates, not verified routes or journey times.",
    "Published venue references describe source-checked information, not future opening guarantees, ticket availability, verified prices or bookings.",
    "Review specific must-sees, avoidance requests, dietary needs and accessibility directly; these preferences have not been independently verified.",
  ];
  const quality: ItineraryQuality = {
    version: 3,
    days: policies,
    assumptions,
    interestCoverage,
    venueChecks,
    classifications: classified.flatMap((day, dayIndex) =>
      day.map((item, activityIndex) => ({
        dayIndex,
        activityIndex,
        ...item.classification,
      })),
    ),
  };
  return { issues, quality };
}
export function validateItineraryQuality(
  plan: ModelItinerary,
  intent: TripIntent,
  base: CityProposal,
  references: VenueReference[] = [],
  categories: ActivityCategoryHint[] = [],
) {
  const result = assessItineraryQuality(
    plan,
    intent,
    base,
    references,
    categories,
  );
  if (result.issues.length)
    throw new PlanningError(
      `The itinerary needs revision before it can be saved. ${result.issues
        .slice(0, 4)
        .map((issue) => issue.message)
        .join(
          " ",
        )} Your original preferences are safe; retry or adjust a copy.`,
    );
  return result.quality;
}
export function qualityPlanningBrief(
  intent: TripIntent,
  base: CityProposal,
  references: VenueReference[] = [],
) {
  return {
    days: dayPolicies(intent, base),
    travelDayAssumption: travelDayAssumption(intent),
    meaningOfActivityCount:
      "Counts concrete experiences, including relevant food experiences; generic rest, logistics, check-in and free-time placeholders do not count.",
    interestRequirements: intent.selected.map((interest) => ({
      interest,
      requirement:
        interest === "Nightlife"
          ? "Include a concrete evening nightlife experience starting at or after 18:00. A daytime pub lunch does not count."
          : "Include at least one concrete matching experience in an activity title and named venue/neighborhood. Expenses alone do not count.",
    })),
    venueReferences: references.filter(
      (ref) => normalized(ref.city) === normalized(base.city),
    ),
    referenceFormat:
      "Weekly keys are 0=Sunday through 6=Saturday. Hours are local minutes since midnight; closedDates are MM-DD. These are published snapshots, not verified future opening times.",
    unverifiedIndoorHours:
      "Use a conservative 10:00–17:00 visitor window if no source-checked venue hours are supplied. Never call this verified opening information.",
    durationGuidance:
      "Museums/palaces 90–240 min; walks/gardens 45–180; food 45–120 (coffee/cafe 30–120); hikes 60–360; other meaningful experiences 30–240. Describe concrete experiences in at least 60 characters, ideally two useful sentences.",
    travelGuidance: `For distances <=2km, allow max(15,ceil(km/4.5*60)+10) minutes; otherwise max(30,ceil(km/20*60)+20). ${intent.accessibility ? "Add another 10 minutes for the accessibility planning allowance, without asserting route accessibility." : ""} Arrival first activity needs at least 30 minutes of settling buffer. Place the full declared buffer between activities.`,
    mealGuidance:
      "Full and single days need a substantial lunch lasting >=45 minutes starting 11:30–14:30 or a full 60-minute free window there excluding travel. Full days, arrival days and single days with an evening window also need dinner lasting >=45 minutes starting 18:00–21:00 or a full 60-minute free window there. Named lunches/dinners must start in these windows. Coffee, pastries and tastings alone are not substantial meals. Use specific streets, neighborhoods or named venues; never Central Paris/city-centre placeholders. A named venue is a suggestion, not verified service or availability. Food activity costs are itemized estimates INCLUDED in foodMinor, which is an inclusive whole-trip allocation. Remaining allocation covers unitemized meals; never add the same food estimate twice. Local transport follows the same inclusive-allocation rule. Itemized estimates must not exceed their category allocations.",
    honesty:
      "No supplied reference proves future availability, prices, accessibility or bookings. If interests, dates, pace, realistic travel assumptions and budget cannot all fit, return feasible=false with an explanation; do not pad the plan or silently drop requirements.",
  };
}
